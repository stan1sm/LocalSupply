import 'dotenv/config'
import { performance } from 'node:perf_hooks'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getPrismaClient } from '../lib/prisma.js'
import { getEmbedding, getEmbeddings } from '../lib/aiClient.js'

const MODEL = process.env.AI_EMBEDDING_MODEL ?? 'text-embedding-3-small'

const SEARCH_QUERIES = [
  'melk', 'kjøttdeig', 'ost', 'brød', 'spaghetti',
  'kylling', 'laks', 'yoghurt', 'smør', 'egg',
  'bacon', 'tomat', 'paprika', 'ris', 'juice',
  'havregryn', 'pølse', 'majones', 'ketchup', 'salt',
]

const EMBED_QUERIES = [
  'kjøttdeig av storfe', 'tortillalefser', 'revet ost',
  'olivenolje extra virgin', 'laktosefri melk',
  'glutenfri pasta', 'soyasaus', 'hvitløk fersk',
  'røkt laks', 'dijon sennep',
]

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!, y = b[i]!
    dot += x * y
    normA += x * x
    normB += y * y
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

function stats(times: number[]) {
  const sorted = [...times].sort((a, b) => a - b)
  const avg = times.reduce((a, b) => a + b, 0) / times.length
  const p50 = sorted[Math.floor(sorted.length * 0.5)]!
  const p95 = sorted[Math.floor(sorted.length * 0.95)]!
  const min = sorted[0]!
  const max = sorted[sorted.length - 1]!
  return { avg, p50, p95, min, max }
}

function fmt(ms: number) {
  return ms.toFixed(1)
}

async function run() {
  const prisma = getPrismaClient()
  const csvRows: string[] = ['Metric,Avg (ms),P50 (ms),P95 (ms),Min (ms),Max (ms),N']

  // --- Dataset size ---
  console.log('=== Dataset Size ===')
  const [productCount, priceCount, embeddingCount] = await Promise.all([
    prisma.catalogProduct.count(),
    prisma.catalogProductPrice.count(),
    (prisma as any).productEmbedding.count({ where: { modelName: MODEL } }),
  ])
  console.log(`  Catalog products:  ${productCount}`)
  console.log(`  Price entries:     ${priceCount}`)
  console.log(`  Embeddings:        ${embeddingCount}`)
  console.log('')

  // --- 1. Text search latency ---
  console.log('=== 1. Text Search Latency ===')
  const textSearchTimes: number[] = []

  for (const q of SEARCH_QUERIES) {
    const t0 = performance.now()
    await prisma.catalogProductPrice.findMany({
      where: {
        currentPrice: { not: null },
        catalogProduct: {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { brand: { contains: q, mode: 'insensitive' } },
            { category: { contains: q, mode: 'insensitive' } },
          ],
        },
      },
      include: { catalogProduct: true },
      take: 50,
    })
    const elapsed = performance.now() - t0
    textSearchTimes.push(elapsed)
    process.stdout.write(`  "${q}": ${fmt(elapsed)}ms\n`)
  }

  const textStats = stats(textSearchTimes)
  console.log(`  => avg=${fmt(textStats.avg)}ms p50=${fmt(textStats.p50)}ms p95=${fmt(textStats.p95)}ms`)
  csvRows.push(`Text search (Prisma ILIKE),${fmt(textStats.avg)},${fmt(textStats.p50)},${fmt(textStats.p95)},${fmt(textStats.min)},${fmt(textStats.max)},${SEARCH_QUERIES.length}`)
  console.log('')

  // --- 2. Single embedding generation ---
  console.log('=== 2. Single Embedding Generation ===')
  const singleEmbedTimes: number[] = []

  for (const q of EMBED_QUERIES) {
    const t0 = performance.now()
    await getEmbedding(q)
    const elapsed = performance.now() - t0
    singleEmbedTimes.push(elapsed)
    process.stdout.write(`  "${q}": ${fmt(elapsed)}ms\n`)
  }

  const singleEmbedStats = stats(singleEmbedTimes)
  console.log(`  => avg=${fmt(singleEmbedStats.avg)}ms p50=${fmt(singleEmbedStats.p50)}ms p95=${fmt(singleEmbedStats.p95)}ms`)
  csvRows.push(`Single embedding (API),${fmt(singleEmbedStats.avg)},${fmt(singleEmbedStats.p50)},${fmt(singleEmbedStats.p95)},${fmt(singleEmbedStats.min)},${fmt(singleEmbedStats.max)},${EMBED_QUERIES.length}`)
  console.log('')

  // --- 3. Batch embedding generation ---
  console.log('=== 3. Batch Embedding Generation (10 inputs) ===')
  const batchEmbedTimes: number[] = []

  for (let i = 0; i < 3; i++) {
    const t0 = performance.now()
    await getEmbeddings(EMBED_QUERIES)
    const elapsed = performance.now() - t0
    batchEmbedTimes.push(elapsed)
    process.stdout.write(`  batch ${i + 1}: ${fmt(elapsed)}ms\n`)
  }

  const batchEmbedStats = stats(batchEmbedTimes)
  console.log(`  => avg=${fmt(batchEmbedStats.avg)}ms (${fmt(batchEmbedStats.avg / EMBED_QUERIES.length)}ms per item)`)
  csvRows.push(`Batch embedding 10x (API),${fmt(batchEmbedStats.avg)},${fmt(batchEmbedStats.p50)},${fmt(batchEmbedStats.p95)},${fmt(batchEmbedStats.min)},${fmt(batchEmbedStats.max)},3`)
  console.log('')

  // --- 4. Vector similarity search ---
  console.log('=== 4. Vector Similarity Search ===')

  // 4a. DB fetch time for all embeddings
  const dbFetchTimes: number[] = []
  let allEmbeddings: Array<{ productId: string; vectorJson: unknown }> = []

  for (let i = 0; i < 3; i++) {
    const t0 = performance.now()
    allEmbeddings = await (prisma as any).productEmbedding.findMany({
      where: { modelName: MODEL },
      select: { productId: true, vectorJson: true },
    })
    const elapsed = performance.now() - t0
    dbFetchTimes.push(elapsed)
    process.stdout.write(`  DB fetch ${i + 1}: ${fmt(elapsed)}ms (${allEmbeddings.length} rows)\n`)
  }

  const dbFetchStats = stats(dbFetchTimes)
  csvRows.push(`Embedding DB fetch (all),${fmt(dbFetchStats.avg)},${fmt(dbFetchStats.p50)},${fmt(dbFetchStats.p95)},${fmt(dbFetchStats.min)},${fmt(dbFetchStats.max)},3`)

  // 4b. CPU cosine similarity scoring
  const vectors = allEmbeddings
    .map((r) => ({ id: r.productId, vec: r.vectorJson as number[] }))
    .filter((r) => Array.isArray(r.vec) && r.vec.length > 0)

  console.log(`  ${vectors.length} valid vectors loaded`)

  const cpuScoringTimes: number[] = []
  const queryEmb = await getEmbedding('kjøttdeig av storfe')

  for (let i = 0; i < 5; i++) {
    const t0 = performance.now()
    const scored = vectors.map((v) => ({
      id: v.id,
      sim: cosineSimilarity(queryEmb, v.vec),
    }))
    scored.sort((a, b) => b.sim - a.sim)
    const _top10 = scored.slice(0, 10)
    const elapsed = performance.now() - t0
    cpuScoringTimes.push(elapsed)
    process.stdout.write(`  CPU scoring ${i + 1}: ${fmt(elapsed)}ms (${vectors.length} vectors)\n`)
  }

  const cpuStats = stats(cpuScoringTimes)
  console.log(`  => avg=${fmt(cpuStats.avg)}ms for ${vectors.length} vectors`)
  csvRows.push(`Cosine similarity scoring (CPU),${fmt(cpuStats.avg)},${fmt(cpuStats.p50)},${fmt(cpuStats.p95)},${fmt(cpuStats.min)},${fmt(cpuStats.max)},5`)
  console.log('')

  // --- 5. Full substitute pipeline ---
  console.log('=== 5. Full Substitute Pipeline ===')
  const substituteTimes: number[] = []
  const storeCode = 'MENY_NO'
  const subQueries = ['laksefilet', 'spaghetti', 'bacon', 'yoghurt', 'olivenolje',
    'parmesan', 'ketchup', 'havregryn', 'majones', 'peanøttsmør']

  for (const q of subQueries) {
    const t0 = performance.now()

    // Step 1: Find source product via text search
    const sourceRow = await prisma.catalogProductPrice.findFirst({
      where: {
        storeCode,
        currentPrice: { not: null },
        catalogProduct: { name: { contains: q, mode: 'insensitive' } },
      },
      select: {
        currentPrice: true,
        catalogProduct: {
          select: {
            id: true, category: true, brand: true,
            embeddings: { where: { modelName: MODEL }, select: { vectorJson: true }, take: 1 },
          },
        },
      },
    })
    if (!sourceRow) { console.log(`  SKIP: ${q}`); continue }

    // Step 2: Get embedding (use stored or generate)
    let itemEmbedding: number[]
    const stored = sourceRow.catalogProduct.embeddings[0]?.vectorJson
    if (Array.isArray(stored)) {
      itemEmbedding = stored as number[]
    } else {
      itemEmbedding = await getEmbedding(q)
    }

    // Step 3: Fetch store candidates (same category)
    const candidates = await prisma.catalogProductPrice.findMany({
      where: {
        storeCode,
        currentPrice: { not: null },
        ...(sourceRow.catalogProduct.category
          ? { catalogProduct: { category: sourceRow.catalogProduct.category } }
          : {}),
      },
      select: {
        catalogProductId: true,
        currentPrice: true,
        catalogProduct: {
          select: {
            name: true, brand: true, category: true,
            embeddings: { where: { modelName: MODEL }, select: { vectorJson: true }, take: 1 },
          },
        },
      },
    })

    // Step 4: Score candidates
    const scored: Array<{ name: string; score: number }> = []
    for (const row of candidates) {
      const emb = row.catalogProduct.embeddings[0]?.vectorJson
      if (!Array.isArray(emb)) continue
      const sim = cosineSimilarity(itemEmbedding, emb as number[])
      const catBonus = sourceRow.catalogProduct.category && row.catalogProduct.category === sourceRow.catalogProduct.category ? 1 : 0
      const brandBonus = sourceRow.catalogProduct.brand && row.catalogProduct.brand === sourceRow.catalogProduct.brand ? 1 : 0
      const sourcePrice = Number(sourceRow.currentPrice) || 0
      const unitPrice = Number(row.currentPrice) || 0
      const priceScore = sourcePrice > 0 ? Math.max(0, 1 - Math.abs(unitPrice - sourcePrice) / sourcePrice) : 0.5
      const composite = sim * 0.55 + catBonus * 0.25 + brandBonus * 0.12 + priceScore * 0.08
      scored.push({ name: row.catalogProduct.name, score: composite })
    }
    scored.sort((a, b) => b.score - a.score)

    const elapsed = performance.now() - t0
    substituteTimes.push(elapsed)
    process.stdout.write(`  "${q}": ${fmt(elapsed)}ms (${candidates.length} candidates, top: ${scored[0]?.name.slice(0, 30) ?? '-'})\n`)
  }

  const subStats = stats(substituteTimes)
  console.log(`  => avg=${fmt(subStats.avg)}ms p50=${fmt(subStats.p50)}ms p95=${fmt(subStats.p95)}ms`)
  csvRows.push(`Full substitute pipeline,${fmt(subStats.avg)},${fmt(subStats.p50)},${fmt(subStats.p95)},${fmt(subStats.min)},${fmt(subStats.max)},${substituteTimes.length}`)

  // --- Summary ---
  console.log('')
  console.log('=== Summary ===')
  console.log(`Dataset: ${productCount} products, ${priceCount} prices, ${embeddingCount} embeddings`)
  console.log(`Text search:        avg ${fmt(textStats.avg)}ms | p50 ${fmt(textStats.p50)}ms | p95 ${fmt(textStats.p95)}ms`)
  console.log(`Single embedding:   avg ${fmt(singleEmbedStats.avg)}ms`)
  console.log(`Batch embed (10x):  avg ${fmt(batchEmbedStats.avg)}ms (${fmt(batchEmbedStats.avg / 10)}ms/item)`)
  console.log(`DB fetch all emb:   avg ${fmt(dbFetchStats.avg)}ms (${allEmbeddings.length} rows)`)
  console.log(`CPU cosine scoring: avg ${fmt(cpuStats.avg)}ms (${vectors.length} vectors)`)
  console.log(`Full substitute:    avg ${fmt(subStats.avg)}ms | p50 ${fmt(subStats.p50)}ms | p95 ${fmt(subStats.p95)}ms`)

  const outPath = join(import.meta.dirname ?? '.', '..', '..', 'benchmark_performance.csv')
  writeFileSync(outPath, csvRows.join('\n'), 'utf-8')
  console.log(`\nCSV written to: ${outPath}`)

  process.exit(0)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
