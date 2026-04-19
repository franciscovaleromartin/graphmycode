import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { createReadStream, mkdirSync, readdirSync, copyFileSync, existsSync, readFileSync, writeFileSync } from 'fs';

// ─── Plugin: inlinar CSS crítico y cargar el resto de forma asíncrona ───────
// Critters extrae el CSS necesario para el primer render y lo inlina en <head>,
// convirtiendo el <link> original a rel="preload" para evitar bloqueo.
function criticalCssPlugin(): Plugin {
  return {
    name: 'critical-css',
    apply: 'build',
    async closeBundle() {
      const Critters = ((await import('critters')).default) as any;
      const critters = new Critters({
        path: path.join(__dirname, 'dist'),
        publicPath: '/',
        preload: 'media',
        pruneSource: false,
        logLevel: 'silent',
      });
      const htmlPath = path.join(__dirname, 'dist/index.html');
      const html = readFileSync(htmlPath, 'utf-8');
      let processed = await critters.process(html);
      // Convertir los <link> con media=print (critters media mode) a rel=preload estándar
      processed = processed.replace(
        /<link rel="stylesheet"([^>]*)media="print"([^>]*)onload="this\.media='all'"([^>]*)>/g,
        '<link rel="preload" as="style"$1$2$3 onload="this.onload=null;this.rel=\'stylesheet\'">',
      );
      // Corregir los <noscript> fallbacks: deben ser rel=stylesheet sin onload
      processed = processed.replace(
        /<noscript><link rel="preload" as="style"([^>]*)onload="[^"]*"([^>]*)><\/noscript>/g,
        '<noscript><link rel="stylesheet"$1$2></noscript>',
      );
      writeFileSync(htmlPath, processed);
    },
  };
}

// ─── Plugin: sirve los archivos WASM de onnxruntime-web localmente ─────────
// onnxruntime-web usa una versión dev que no existe en jsDelivr CDN,
// así que los servimos directamente desde node_modules en dev y los
// copiamos a dist/ort/ en producción.
function ortWasmPlugin(): Plugin {
  const onnxDistDir = path.join(__dirname, 'node_modules/onnxruntime-web/dist');
  const urlPrefix = '/ort/';

  return {
    name: 'ort-wasm-serve',

    // Dev: middleware que sirve /ort/* desde node_modules/onnxruntime-web/dist/
    configureServer(server) {
      server.middlewares.use(urlPrefix, (req, res, next) => {
        const fileName = (req.url ?? '').replace(/^\//, '');
        if (!fileName) { next(); return; }
        const ext = fileName.split('.').pop();
        if (ext === 'wasm') res.setHeader('Content-Type', 'application/wasm');
        else if (ext === 'mjs') res.setHeader('Content-Type', 'application/javascript');
        createReadStream(path.join(onnxDistDir, fileName))
          .on('error', () => next())
          .pipe(res);
      });
    },

    // Preview: igual que dev
    configurePreviewServer(server) {
      server.middlewares.use(urlPrefix, (req, res, next) => {
        const fileName = (req.url ?? '').replace(/^\//, '');
        if (!fileName) { next(); return; }
        const ext = fileName.split('.').pop();
        if (ext === 'wasm') res.setHeader('Content-Type', 'application/wasm');
        else if (ext === 'mjs') res.setHeader('Content-Type', 'application/javascript');
        createReadStream(path.join(onnxDistDir, fileName))
          .on('error', () => next())
          .pipe(res);
      });
    },

    // Build: copia los archivos necesarios a dist/ort/ y dist/assets/
    // Los .mjs van también a dist/assets/ porque los bundles de Rollup resuelven
    // import.meta.url relativo a /assets/ y necesitan encontrar el worker allí.
    closeBundle() {
      const ortDir = path.join(__dirname, 'dist/ort');
      const assetsDir = path.join(__dirname, 'dist/assets');
      mkdirSync(ortDir, { recursive: true });
      mkdirSync(assetsDir, { recursive: true });
      for (const file of readdirSync(onnxDistDir)) {
        // Solo archivos WASM/MJS del runtime SIMD threaded (excluye jspi experimental y bundles ort.*)
        if (
          file.startsWith('ort-wasm-simd-threaded') &&
          !file.includes('jspi') &&
          (file.endsWith('.wasm') || file.endsWith('.mjs'))
        ) {
          copyFileSync(path.join(onnxDistDir, file), path.join(ortDir, file));
          // Los workers .mjs también en /assets/ para que import.meta.url los encuentre
          if (file.endsWith('.mjs')) {
            copyFileSync(path.join(onnxDistDir, file), path.join(assetsDir, file));
          }
        }
      }
    },
  };
}

export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss(), ortWasmPlugin(), criticalCssPlugin()],
  worker: {
    format: 'es',
  },
  // esnext permite import.meta.url en workers y dynamic imports que necesita transformers.js
  build: {
    target: 'esnext',
  },
  optimizeDeps: {
    // Excluir transformers.js del pre-bundling de Vite para que sus
    // imports dinámicos (workers ORT, WASM) se resuelvan correctamente en prod
    exclude: ['@huggingface/transformers'],
  },
  define: {
    __REQUIRED_NODE_VERSION__: JSON.stringify('20'),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../shared'),
      // Fix for Rollup failing to resolve this deep import from @langchain/anthropic
      '@anthropic-ai/sdk/lib/transform-json-schema': path.resolve(
        __dirname,
        'node_modules/@anthropic-ai/sdk/lib/transform-json-schema.mjs',
      ),
      // Fix for mermaid d3-color prototype crash on Vercel (known issue with mermaid 10.9.0+ and Vite)
      mermaid: path.resolve(__dirname, 'node_modules/mermaid/dist/mermaid.esm.min.mjs'),
    },
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
    fs: {
      allow: ['..'],
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
});
