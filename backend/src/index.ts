import 'dotenv/config'
import app from './app.js'
import { syncCatalog } from './lib/catalogSync.js'

const port = process.env.PORT ? Number(process.env.PORT) : 3001

app.listen(port, () => {
  console.log(`Server listening on port ${port}`)
})

const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000

async function runScheduledSync() {
  try {
    console.log('Running scheduled catalog sync...')
    const result = await syncCatalog({ logger: console })
    console.log('Scheduled catalog sync complete', result)
  } catch (error) {
    console.error('Scheduled catalog sync failed', error)
  }
}

setInterval(runScheduledSync, SYNC_INTERVAL_MS)
