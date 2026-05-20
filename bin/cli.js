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

  console.log(`✅ ${(buf.length / 1024 / 1024).toFixed(1)} MB`)

  // Puerto aleatorio en rango efímero
  const port = 49152 + Math.floor(Math.random() * 16383)

  const server = createServer((_req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Length', buf.length)
    res.end(buf)
  })

  server.listen(port, '127.0.0.1', () => {
    const url = `https://graphmycode.com?localzip=http://127.0.0.1:${port}/repo.zip&project=${encodeURIComponent(projectName)}`
    console.log(`🌐 Abriendo graphmycode.com...`)
    openBrowser(url)
    console.log(`⏳ Servidor activo 90s — Ctrl+C para salir antes\n`)
  })

  const shutdown = () => { server.close(); process.exit(0) }
  setTimeout(shutdown, 90_000)
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch(e => {
  console.error('❌', e.message)
  process.exit(1)
})
