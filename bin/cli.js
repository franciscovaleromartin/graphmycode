#!/usr/bin/env node
// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

import { readFileSync, readdirSync, statSync } from 'fs'
import { join, basename } from 'path'
import { createServer } from 'http'
import { exec } from 'child_process'
import JSZip from 'jszip'

const cwd = process.cwd()
const projectName = basename(cwd)

const IGNORE = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt',
  'coverage', '.vite', '.playwright', '__pycache__', '.cache',
  '.turbo', '.vercel', '.DS_Store', 'vendor', 'target',
])

function addDir(zip, dir, base = '') {
  let entries
  try { entries = readdirSync(dir) } catch { return }
  for (const item of entries) {
    if (IGNORE.has(item) || item.startsWith('.')) continue
    const full = join(dir, item)
    const rel = base ? `${base}/${item}` : item
    try {
      const st = statSync(full)
      if (st.isDirectory()) {
        addDir(zip, full, rel)
      } else if (st.size < 500_000) {
        zip.file(rel, readFileSync(full))
      }
    } catch { /* skip permission errors */ }
  }
}

function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? `open "${url}"`
    : process.platform === 'win32' ? `start "" "${url}"`
    : `xdg-open "${url}"`
  exec(cmd)
}

async function main() {
  console.log(`\n📦 graphmycode — comprimiendo ${projectName}...`)

  const zip = new JSZip()
  addDir(zip, cwd)
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })

  const mb = (buf.length / 1024 / 1024).toFixed(1)
  console.log(`✅ ${mb} MB`)

  if (buf.length > 50 * 1024 * 1024) {
    console.error('❌ El proyecto comprimido supera 50 MB. Asegúrate de excluir node_modules, dist y similares.')
    process.exit(1)
  }

  // Servidor HTTP local que sirve el zip con CORS para graphmycode.com
  const server = createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
      res.writeHead(204)
      res.end()
      return
    }
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Length', buf.length)
    res.writeHead(200)
    res.end(buf)
  })

  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address()
    const url = `https://graphmycode.com/#localserver=http://127.0.0.1:${port}&project=${encodeURIComponent(projectName)}`

    console.log(`🌐 Abriendo graphmycode.com...\n`)
    openBrowser(url)
    console.log(`   Servidor local activo en: http://127.0.0.1:${port}`)
    console.log(`   Pulsa Ctrl+C para salir cuando el análisis termine.\n`)
  })

  // Cierre automático tras 5 minutos por si el usuario olvida Ctrl+C
  setTimeout(() => {
    server.close()
    process.exit(0)
  }, 5 * 60 * 1000).unref()
}

main().catch(e => {
  console.error('❌', e.message)
  process.exit(1)
})
