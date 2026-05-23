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

  // Codificar en base64url para el relay HTML (mecanismo window.name)
  const b64 = buf.toString('base64url')

  // Servidor HTTP local: Chrome y Firefox lo usan directamente.
  // Access-Control-Allow-Private-Network es obligatorio desde Chrome 94
  // para que fetch() desde HTTPS pueda llegar a localhost.
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

    // Relay HTML: escribe el ZIP en window.name antes de navegar a graphmycode.com.
    // window.name persiste entre navegaciones cross-origin, por lo que Safari puede
    // leerlo aunque bloquee fetch() a localhost. Chrome/Firefox usan el servidor.
    const payload = JSON.stringify({ zip: b64, project: projectName })
    const relayHtml = `<!DOCTYPE html><meta charset="utf-8"><script>try{window.name=${JSON.stringify(payload)}}catch(e){}location.replace(${JSON.stringify(url)})<\/script>`
    const relayTmp = join(tmpdir(), 'graphmycode-relay.html')
    writeFileSync(relayTmp, relayHtml)

    console.log(`🌐 Abriendo graphmycode.com...\n`)
    console.log(`   Si el navegador bloquea la carga, arrastra este fichero:`)
    console.log(`   ${tmpZip}\n`)
    openBrowser(`file://${relayTmp}`)
  })

  setTimeout(() => { server.close(); process.exit(0) }, 5 * 60 * 1000).unref()
}

main().catch(e => {
  console.error('❌', e.message)
  process.exit(1)
})
