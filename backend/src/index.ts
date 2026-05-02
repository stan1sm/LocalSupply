/**
 * @module index
 * Application entry point: starts the HTTP server and schedules a daily catalog sync.
 */
import 'dotenv/config'
import app from './app.js'
import { syncCatalog } from './lib/catalogSync.js'

const port = process.env.PORT ? Number(process.env.PORT) : 3001

app.listen(port, () => {
  console.log(`Server listening on port ${port}`)
})

/** Interval between automatic catalog sync runs: 24 hours in milliseconds. */
const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000

/**
 * Runs a full catalog sync via `syncCatalog` and logs the result.
 *
 * Errors are caught and logged so that a single failed sync does not stop the interval timer.
 *
 * @returns Promise<void> — resolves when the sync attempt finishes (success or error).
 */
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
