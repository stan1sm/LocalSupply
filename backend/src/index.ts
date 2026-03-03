import 'dotenv/config'
import app from './app.js'

const port = process.env.PORT ? Number(process.env.PORT) : 3001

app.listen(port, () => {
  console.log(`Server listening on port ${port}`)
})
