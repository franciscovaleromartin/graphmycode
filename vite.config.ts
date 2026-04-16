import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import { createReadStream, mkdirSync, readdirSync, copyFileSync, existsSync } from 'fs';

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
  plugins: [
    react(),
    tailwindcss(),
    ortWasmPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        // Precachear JS, CSS, HTML, imágenes y los WASM de tree-sitter (≤5 MB c/u).
        // Los archivos ORT se excluyen del SW por completo: ya tienen
        // Cache-Control: max-age=31536000,immutable en vercel.json y el browser
        // los gestiona con HTTP cache. Interceptarlos con el SW rompe la carga
        // de los módulos worker de onnxruntime (error "Importing a module script failed").
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,wasm}'],
        globIgnores: [
          '**/ort/**',           // /ort/*.wasm y /ort/*.mjs — gestionados por HTTP cache
          '**/assets/ort-wasm*', // /assets/ort-wasm-simd-threaded.jsep-*.wasm (21 MB)
        ],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024, // 6 MB cubre cpp (4.4 MB), csharp (3.8 MB)…
        navigateFallback: 'index.html',
        runtimeCaching: [
          // Google Fonts CSS — se actualiza cada semana
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: { maxEntries: 4, maxAgeSeconds: 7 * 24 * 60 * 60 },
            },
          },
          // Google Fonts archivos de fuentes — inmutables, 1 año
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 30, maxAgeSeconds: 365 * 24 * 60 * 60 },
            },
          },
          // ── APIs de IA: siempre red (fallan limpiamente sin conexión) ──
          { urlPattern: /^https:\/\/api\.openai\.com\/.*/i,                     handler: 'NetworkOnly' },
          { urlPattern: /^https:\/\/api\.anthropic\.com\/.*/i,                  handler: 'NetworkOnly' },
          { urlPattern: /^https:\/\/generativelanguage\.googleapis\.com\/.*/i,  handler: 'NetworkOnly' },
          { urlPattern: /^https:\/\/aistudio\.google\.com\/.*/i,                handler: 'NetworkOnly' },
          { urlPattern: /^https:\/\/openrouter\.ai\/.*/i,                       handler: 'NetworkOnly' },
          { urlPattern: /^https:\/\/api\.minimax\.io\/.*/i,                     handler: 'NetworkOnly' },
          { urlPattern: /^https:\/\/api\.z\.ai\/.*/i,                           handler: 'NetworkOnly' },
          // ── Recursos de repos externos ──
          { urlPattern: /^https:\/\/api\.github\.com\/.*/i,                     handler: 'NetworkOnly' },
          { urlPattern: /^https:\/\/raw\.githubusercontent\.com\/.*/i,          handler: 'NetworkOnly' },
          { urlPattern: /^https:\/\/gitnexus\.vercel\.app\/.*/i,                handler: 'NetworkOnly' },
          // ── HuggingFace (descarga de modelos de embeddings) ──
          { urlPattern: /^https:\/\/huggingface\.co\/.*/i,                      handler: 'NetworkOnly' },
          { urlPattern: /^https:\/\/cdn-lfs\.huggingface\.co\/.*/i,             handler: 'NetworkOnly' },
        ],
      },
      manifest: {
        name: 'GraphMyCode',
        short_name: 'GraphMyCode',
        description: 'Visualiza y entiende tu código como un grafo interactivo',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/favicon.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
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
