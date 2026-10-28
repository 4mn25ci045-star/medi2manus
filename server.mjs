import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer as createViteServer } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const port = Number(process.env.PORT || 3000)
const isProduction = process.env.NODE_ENV === 'production'

app.use(express.json({ limit: '2mb' }))
app.get('/api/config', (_req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || ''
  })
})
app.get('/healthz', (_req, res) => res.status(200).json({ ok: true, service: 'medirecover' }))

if (!isProduction) {
  const vite = await createViteServer({ server: { middlewareMode: true, hmr: true }, appType: 'spa' })
  app.use(vite.middlewares)
} else {
  app.use(express.static(path.join(__dirname, 'dist')))
  app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')))
}

app.listen(port, '0.0.0.0', () => console.log(`MediRecover listening on ${port}`))
