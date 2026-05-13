#!/usr/bin/env node

import { writeFileSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import JSZip from 'jszip';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

function addFolderToZip(zip, folderPath, basePath = '') {
  const items = readdirSync(folderPath);
  const ignoreDirs = ['node_modules', '.git', 'dist', 'build', '.vite', 'coverage', '.playwright'];
  
  for (const item of items) {
    if (ignoreDirs.includes(item)) continue;
    
    const fullPath = join(folderPath, item);
    const relativePath = basePath ? `${basePath}/${item}` : item;
    
    if (statSync(fullPath).isDirectory()) {
      addFolderToZip(zip, fullPath, relativePath);
    } else {
      const content = readFileSync(fullPath);
      zip.file(relativePath, content);
    }
  }
}

async function main() {
  console.log('📦 Comprimiendo proyecto...');
  
  const zip = new JSZip();
  addFolderToZip(zip, projectRoot);
  
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
  const tempZipPath = join(homedir(), 'graphmycode-project.zip');
  writeFileSync(tempZipPath, zipBuffer);
  
  console.log('✅ Proyecto comprimido:', tempZipPath);
  
  console.log('🌐 Abriendo graphmycode.com...');
  
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  await page.goto('https://graphmycode.com');
  
  console.log('⏳ Esperando que cargue la página...');
  await page.waitForLoadState('networkidle');
  
  console.log('📤 Subiendo archivo ZIP...');
  
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(tempZipPath);
  
  console.log('✅ ¡Archivo subido! 🎉');
  
  await browser.close();
}

main().catch(console.error);