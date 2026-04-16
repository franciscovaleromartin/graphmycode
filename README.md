# GraphMyCode

**Visualize your codebase as an interactive knowledge graph — entirely in your browser.**

GraphMyCode parses your source code and renders it as a navigable graph of files, functions, classes, interfaces, and their relationships. No server. No uploads. No account. Everything runs locally using WebAssembly.

🌐 **[graphmycode.com](https://graphmycode.com)**

---

## Four views

### 🕸️ Structural
Interactive graph of files, classes, functions, imports, and call relationships. Answer questions like:
- What does this file import?
- Who calls this function?
- Which modules are isolated?
- Follow the call stack easily

### 🧠 Semantic 3D
Groups nodes by code similarity using embeddings — regardless of folder structure. Useful for:
- Finding duplicated logic
- Detecting modules that do the same thing
- Analyzing the real impact of a change beyond direct dependencies

### 🏙️ Technical Debt City
Renders the repository as a 3D city. Each node is a building grouped by folder. The taller the building in its district, the more technical debt. Helps you:
- Identify the hardest files to change
- Find the most coupled code
- Decide what to refactor first

### 🔥 Dependency Heatmap
Shows real coupling between files. Bidirectional dependencies appear as orange edges, revealing:
- Import cycles
- Circularly coupled modules
- Spaghetti code at a glance

---

## How it works

Upload a `.zip` of your project or paste a public GitHub URL. GraphMyCode:

1. Parses your code with [tree-sitter](https://tree-sitter.github.io/tree-sitter/) (via WASM)
2. Builds a knowledge graph of symbols and dependencies in memory
3. Renders it interactively in the browser

Your code never leaves your browser.

---

## Optional: AI Q&A

Once the graph is loaded, you can connect your own AI provider (OpenAI, Gemini, Anthropic, or Ollama) to ask questions in natural language about your codebase. Your API key is stored only in your browser.

> ⚠️ When using a cloud AI provider, parts of your code will be sent to that provider. Use Ollama to keep everything local.

---

## Languages supported

JavaScript, TypeScript, Python, Java, Go, Rust, C, C++, C#, PHP, Ruby, Swift

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Styling | Tailwind CSS v4 |
| Graph rendering (2D) | Sigma.js + Graphology + ForceAtlas2 |
| Graph rendering (3D) | Three.js / React Three Fiber |
| Heatmap | Canvas 2D + graphology-layout-noverlap |
| Code parsing | web-tree-sitter (WASM) |
| Semantic embeddings | @huggingface/transformers (WASM) |
| Community detection | Leiden algorithm |
| Dimensionality reduction | UMAP |

---

## Getting started

```bash
npm install
npm run dev
```

Open `http://localhost:5173`, drop a `.zip` of any codebase, and explore.

## Build

```bash
npm run build
```

## Tests

```bash
npm test
```

---

## Author

Built by [Francisco Valero](https://github.com/franciscovaleromartin).
