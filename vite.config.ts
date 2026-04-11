import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { createReadStream, mkdirSync, readdirSync, copyFileSync } from 'fs';

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

    // Build: copia los archivos necesarios a dist/ort/
    closeBundle() {
      const outDir = path.join(__dirname, 'dist/ort');
      mkdirSync(outDir, { recursive: true });
      for (const file of readdirSync(onnxDistDir)) {
        // Solo archivos WASM/MJS del runtime SIMD threaded (excluye jspi experimental y bundles ort.*)
        if (
          file.startsWith('ort-wasm-simd-threaded') &&
          !file.includes('jspi') &&
          (file.endsWith('.wasm') || file.endsWith('.mjs'))
        ) {
          copyFileSync(path.join(onnxDistDir, file), path.join(outDir, file));
        }
      }
    },
  };
}

export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss(), ortWasmPlugin()],
  worker: {
    format: 'es',
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
