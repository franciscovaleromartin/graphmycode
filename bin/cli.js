#!/usr/bin/env node
// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs'
import { join, basename } from 'path'
import { tmpdir } from 'os'
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

  const tmpZip = join(tmpdir(), `graphmycode-${projectName}.zip`)
  writeFileSync(tmpZip, buf)

  // Proyectos pequeños (≤700 KB): base64url en el hash → funciona en todos los navegadores
  // incluido Safari, sin servidor local, sin mixed content.
  const SMALL_THRESHOLD = 700 * 1024
  if (buf.length <= SMALL_THRESHOLD) {
    const b64 = buf.toString('base64url')
    const url = `https://graphmycode.com/#localzip=${b64}&project=${encodeURIComponent(projectName)}`
    const html = `<!DOCTYPE html><meta charset="utf-8"><script>location.replace(${JSON.stringify(url)})<\/script>`
    const tmp = join(tmpdir(), 'graphmycode-launch.html')
    writeFileSync(tmp, html)
    console.log(`🌐 Abriendo graphmycode.com...\n`)
    openBrowser(`file://${tmp}`)
    setTimeout(() => process.exit(0), 3000).unref()
    return
  }

  // Proyectos grandes: servidor HTTP local (Chrome y Firefox).
  // Safari bloquea fetch() a localhost desde HTTPS; se muestra el path del zip para arrastrarlo.
  const server = createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
      res.setHeader('Access-Control-Allow-Private-Network', 'true')
      res.writeHead(204)
      res.end()
      return
    }
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Private-Network', 'true')
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Length', buf.length)
    res.writeHead(200)
    res.end(buf)
  })

  server.listen(0, 'localhost', () => {
    const { port } = server.address()
    const url = `https://graphmycode.com/#localserver=http://localhost:${port}&localpath=${encodeURIComponent(tmpZip)}&project=${encodeURIComponent(projectName)}`
    const relayHtml = `<!DOCTYPE html><meta charset="utf-8"><script>location.replace(${JSON.stringify(url)})<\/script>`
    const relayTmp = join(tmpdir(), 'graphmycode-relay.html')
    writeFileSync(relayTmp, relayHtml)
    console.log(`🌐 Abriendo graphmycode.com...\n`)
    console.log(`   En Safari, arrastra este fichero a la zona de carga:`)
    console.log(`   ${tmpZip}\n`)
    openBrowser(`file://${relayTmp}`)
  })

  setTimeout(() => { server.close(); process.exit(0) }, 5 * 60 * 1000).unref()
}

main().catch(e => {
  console.error('❌', e.message)
  process.exit(1)
})
