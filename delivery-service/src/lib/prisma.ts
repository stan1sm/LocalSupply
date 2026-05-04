import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

let client: PrismaClient | null = null

export function getPrismaClient(): PrismaClient {
  if (!client) {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    const adapter = new PrismaPg(pool)
    client = new PrismaClient({ adapter })
  }
  return client
}
