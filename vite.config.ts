import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
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
