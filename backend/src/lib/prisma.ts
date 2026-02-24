import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { PrismaClient } from '../generated/prisma/client.js'

const globalForPrisma = globalThis as typeof globalThis & {
  pgPool?: Pool
  prisma?: PrismaClient
}

function createPrismaClient() {
  const datasourceUrl = process.env.DATABASE_URL

  if (!datasourceUrl) {
    throw new Error('DATABASE_URL is not configured.')
  }

  const pool = globalForPrisma.pgPool ?? new Pool({ connectionString: datasourceUrl })
  globalForPrisma.pgPool = pool

  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter })
}

export function getPrismaClient() {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient()
  }

  return globalForPrisma.prisma
}
