/**
 * @module prisma
 * Provides a singleton PrismaClient instance backed by a shared pg connection pool.
 */

import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { PrismaClient } from '../generated/prisma/client.js'

const globalForPrisma = globalThis as typeof globalThis & {
  pgPool?: Pool
  prisma?: PrismaClient
}

function createPrismaClient() {
  const datasourceUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? process.env.POSTGRES_PRISMA_URL

  if (!datasourceUrl) {
    throw new Error('DATABASE_URL (or POSTGRES_URL / POSTGRES_PRISMA_URL) is not configured.')
  }

  const pool = globalForPrisma.pgPool ?? new Pool({ connectionString: datasourceUrl })
  globalForPrisma.pgPool = pool

  const adapter = new PrismaPg(pool as any)
  return new PrismaClient({ adapter })
}

/**
 * Returns the singleton PrismaClient, creating it on first call using a shared pg connection pool.
 * @returns {PrismaClient} The application-wide Prisma client instance.
 */
export function getPrismaClient() {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient()
  }

  return globalForPrisma.prisma
}
