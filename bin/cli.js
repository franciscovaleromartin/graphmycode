#!/usr/bin/env node
// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs'
import { join, basename } from 'path'
import { tmpdir } from 'os'
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

  // Codificar en base64 URL-safe y pasar por fragment hash — evita mixed content en Safari
  const b64 = buf.toString('base64url')
  const target = `https://graphmycode.com#localzip=${b64}&project=${encodeURIComponent(projectName)}`

  // HTML temporal que redirige instantáneamente al fragment con los datos
  const html = `<!DOCTYPE html><meta charset="utf-8"><script>location.replace(${JSON.stringify(target)})</script>`
  const tmp = join(tmpdir(), 'graphmycode-launch.html')
  writeFileSync(tmp, html)

  console.log(`🌐 Abriendo graphmycode.com...\n`)
  openBrowser(`file://${tmp}`)
}

main().catch(e => {
  console.error('❌', e.message)
  process.exit(1)
})
