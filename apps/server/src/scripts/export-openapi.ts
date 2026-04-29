import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app } from '../app.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const spec = app.getOpenAPI31Document({
  openapi: '3.1.0',
  info: { title: 'Server Template API', version: '1.0.0' },
  security: [{ BearerAuth: [] }],
})

const outputPath = resolve(__dirname, '../../openapi.json')
writeFileSync(outputPath, JSON.stringify(spec, null, 2), 'utf-8')

console.log(`OpenAPI spec exported to ${outputPath}`)
