import 'dotenv/config'
import app from './app.js'
import { advancePendingDeliveries } from './lib/simulator.js'

const PORT = Number(process.env.PORT ?? 3002)

app.listen(PORT, () => {
  console.log(`LocalSupply Delivery Service running on port ${PORT}`)

  // Poll every 30s locally — same logic as the Vercel cron, handles restarts
  setInterval(() => {
    advancePendingDeliveries().catch((err) => console.error('advance-deliveries poll failed', err))
  }, 30_000)

  // Run once immediately to catch any deliveries stuck from a previous run
  advancePendingDeliveries().catch((err) => console.error('advance-deliveries startup failed', err))
})
