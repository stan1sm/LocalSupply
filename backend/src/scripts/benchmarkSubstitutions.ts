import 'dotenv/config'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getPrismaClient } from '../lib/prisma.js'

const MODEL = process.env.AI_EMBEDDING_MODEL ?? 'text-embedding-3-small'

// 50 source products the user has in their cart. We find each via text search,
// then find the best substitute (a different product) using three strategies.
const QUERIES = [
  'Kjøttdeig', 'Kyllingfilet', 'Laksefilet', 'Tortilla',
  'Revet Ost', 'Rømme', 'Tacokrydder', 'Spaghetti',
  'Hvitløk', 'Løk', 'Tomater', 'Agurk',
  'Paprika', 'Smør', 'Melk', 'Egg',
  'Mel', 'Sukker', 'Ris', 'Olivenolje',
  'Bacon', 'Pølse', 'Brød', 'Fløte',
  'Yoghurt', 'Parmesan', 'Mozzarella', 'Cheddar',
  'Havregryn', 'Cornflakes', 'Peanøttsmør', 'Syltetøy',
  'Honning', 'Tomatpure', 'Soyasaus', 'Pastasaus',
  'Sennep', 'Majones', 'Ketchup', 'Salt',
  'Pepper', 'Basilikum', 'Oregano', 'Cottage Cheese',
  'Laks Røkt', 'Brie', 'Creme Fraiche', 'Pesto',
  'Nuggets', 'Juice',
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

type Product = {
  id: string
  name: string
  brand: string | null
  category: string | null
  unitPrice: number
  embedding: number[]
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number') return v
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

async function run() {
  const prisma = getPrismaClient()
  const storeCode = 'MENY_NO'

  console.error('Loading store products and embeddings...')
  const storeProducts = await prisma.catalogProductPrice.findMany({
    where: { storeCode, currentPrice: { not: null } },
    select: {
      catalogProductId: true,
      currentPrice: true,
      catalogProduct: {
        select: {
          id: true,
          name: true,
          brand: true,
          category: true,
          embeddings: { where: { modelName: MODEL }, select: { vectorJson: true }, take: 1 },
        },
      },
    },
  })

  const byProduct = new Map<string, typeof storeProducts[0]>()
  for (const row of storeProducts) {
    const existing = byProduct.get(row.catalogProductId)
    if (!existing) {
      byProduct.set(row.catalogProductId, row)
    } else {
      const a = Number(existing.currentPrice) || Infinity
      const b = Number(row.currentPrice) || Infinity
      if (b < a) byProduct.set(row.catalogProductId, row)
    }
  }

  const allProducts: Product[] = []
  for (const row of byProduct.values()) {
    const vec = row.catalogProduct.embeddings[0]?.vectorJson
    if (!Array.isArray(vec)) continue
    allProducts.push({
      id: row.catalogProduct.id,
      name: row.catalogProduct.name,
      brand: row.catalogProduct.brand,
      category: row.catalogProduct.category,
      unitPrice: asNumber(row.currentPrice) ?? 0,
      embedding: vec as number[],
    })
  }
  console.error(`${allProducts.length} products with embeddings`)

  let embCorrect = 0, embAcceptable = 0, embIncorrect = 0
  let compCorrect = 0, compAcceptable = 0, compIncorrect = 0
  let catCorrect = 0, catAcceptable = 0, catIncorrect = 0
  let tested = 0

  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
  const csvRows: string[] = [
    'Source Product,Source Category,Embedding Substitute,Embedding Category,Embedding Verdict,Composite Substitute,Composite Verdict,CatFilter Substitute,CatFilter Verdict',
  ]

  for (const query of QUERIES) {
    // Find source product via text search (simulates user's cart item)
    const queryLower = query.toLowerCase()
    const source = allProducts.find((p) =>
      p.name.toLowerCase().includes(queryLower),
    )
    if (!source) {
      console.error(`  SKIP: no text match for "${query}"`)
      continue
    }
    tested++

    const others = allProducts.filter((p) => p.id !== source.id)

    // Strategy 1: Embedding only
    const embScored = others
      .map((p) => ({ ...p, score: cosineSimilarity(source.embedding, p.embedding) }))
      .sort((a, b) => b.score - a.score)
    const embTop = embScored[0]!

    // Strategy 2: Composite scoring (0.55E + 0.25C + 0.12B + 0.08P)
    const compositeScored = embScored.map((p) => {
      const catBonus = source.category && p.category === source.category ? 1 : 0
      const brandBonus = source.brand && p.brand === source.brand ? 1 : 0
      const priceScore = source.unitPrice > 0
        ? Math.max(0, 1 - Math.abs(p.unitPrice - source.unitPrice) / source.unitPrice)
        : 0.5
      return { ...p, composite: p.score * 0.55 + catBonus * 0.25 + brandBonus * 0.12 + priceScore * 0.08 }
    }).sort((a, b) => b.composite - a.composite)
    const compTop = compositeScored[0]!

    // Strategy 3: Composite + category filter
    const catFiltered = compositeScored.filter((p) => source.category && p.category === source.category)
    const catTop = catFiltered.length > 0 ? catFiltered[0]! : compTop

    // Classify: is the substitute in the same category as the source?
    // C = same category, A = related (query word in name), I = unrelated
    const classify = (sub: Product): 'C' | 'A' | 'I' => {
      if (source.category && sub.category === source.category) return 'C'
      const srcWords = source.name.toLowerCase().split(/\s+/).filter((w) => w.length >= 3)
      const subNameLower = sub.name.toLowerCase()
      for (const w of srcWords) {
        if (subNameLower.includes(w)) return 'A'
      }
      return 'I'
    }

    const embV = classify(embTop)
    const compV = classify(compTop)
    const catV = classify(catTop)

    if (embV === 'C') embCorrect++; else if (embV === 'A') embAcceptable++; else embIncorrect++
    if (compV === 'C') compCorrect++; else if (compV === 'A') compAcceptable++; else compIncorrect++
    if (catV === 'C') catCorrect++; else if (catV === 'A') catAcceptable++; else catIncorrect++

    csvRows.push([
      esc(source.name), esc(source.category ?? ''),
      esc(embTop.name), esc(embTop.category ?? ''), embV,
      esc(compTop.name), compV,
      esc(catTop.name), catV,
    ].join(','))

    console.log(`  [${tested}/${QUERIES.length}] ${query} → emb:${embV} comp:${compV} cat:${catV}`)
  }

  const n = tested

  csvRows.push('')
  csvRows.push(`Summary,,,,,,,,`)
  csvRows.push(`Embeddings only,Correct ${embCorrect} (${Math.round(embCorrect / n * 100)}%),Acceptable ${embAcceptable} (${Math.round(embAcceptable / n * 100)}%),Incorrect ${embIncorrect} (${Math.round(embIncorrect / n * 100)}%),,,,`)
  csvRows.push(`Composite scoring,Correct ${compCorrect} (${Math.round(compCorrect / n * 100)}%),Acceptable ${compAcceptable} (${Math.round(compAcceptable / n * 100)}%),Incorrect ${compIncorrect} (${Math.round(compIncorrect / n * 100)}%),,,,`)
  csvRows.push(`Composite + cat filter,Correct ${catCorrect} (${Math.round(catCorrect / n * 100)}%),Acceptable ${catAcceptable} (${Math.round(catAcceptable / n * 100)}%),Incorrect ${catIncorrect} (${Math.round(catIncorrect / n * 100)}%),,,,`)

  const outPath = join(import.meta.dirname ?? '.', '..', '..', 'benchmark_results.csv')
  writeFileSync(outPath, csvRows.join('\n'), 'utf-8')

  console.log('')
  console.log(`Results written to: ${outPath}`)
  console.log(`Embeddings only:      ${embCorrect}/${n} correct (${Math.round(embCorrect / n * 100)}%), ${embAcceptable}/${n} acceptable, ${embIncorrect}/${n} incorrect`)
  console.log(`Composite scoring:    ${compCorrect}/${n} correct (${Math.round(compCorrect / n * 100)}%), ${compAcceptable}/${n} acceptable, ${compIncorrect}/${n} incorrect`)
  console.log(`Composite + cat filt: ${catCorrect}/${n} correct (${Math.round(catCorrect / n * 100)}%), ${catAcceptable}/${n} acceptable, ${catIncorrect}/${n} incorrect`)

  process.exit(0)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
