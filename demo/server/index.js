import express from 'express'
import cors from 'cors'
import { createAiModelMiddleware } from 'ai-model-form/server'

const app = express()
const PORT = process.env.PORT || 9271

app.use(cors())
app.use(express.json())

app.use('/api', createAiModelMiddleware({ testTimeoutMs: 10000 }))

app.get('/', (_req, res) => {
  res.json({ ok: true, message: 'ai-model-form demo server' })
})

app.listen(PORT, () => {
  console.log(`[demo] server listening on http://localhost:${PORT}`)
  console.log(`[demo] middleware mounted at /api/ai-model`)
})
