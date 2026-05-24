# GraphMyCode

![GraphMyCode](public/og-image.png)
video: https://youtu.be/M9WKj7Hn5m0?si=5U75N80ezUs5-Heg

[![License: PolyForm Noncommercial](https://img.shields.io/badge/License-PolyForm%20Noncommercial%201.0-blue.svg)](https://polyformproject.org/licenses/noncommercial/1.0.0)

**Visualize your codebase as an interactive knowledge graph — entirely in your browser.**

GraphMyCode parses your source code and renders it as a navigable graph of files, functions, classes, interfaces, and their relationships. No server. No uploads. No account. Everything runs locally using WebAssembly.

🌐 **[graphmycode.com](https://graphmycode.com)**

<video src="https://raw.githubusercontent.com/franciscovaleromartin/graphmycode/main/public/anuncio_GraphMyCode_en.mp4" controls width="100%"></video>

---

## Six views

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

### ⚡ Code Flow
Renders the internal execution flow of a single file as a directed flowchart. Each node represents a function, method, class, decision branch, loop, or error handler. Useful for:
- Tracing how execution moves through a file
- Seeing which functions call each other
- Locating every `if`, loop, and `try/catch` at a glance
- Exporting the full flowchart as SVG

### 🏗️ Architectural Layer
Auto-detects your project's architectural layers (`api`, `service`, `data`, `ui`, `utility`, `config`, `test`) from file paths and renders them as parallel swim lanes. Cross-layer edges are color-coded: blue for correct-direction dependencies, orange for inverted ones (architectural violations). Useful for:
- Seeing how your codebase maps to a layered architecture at a glance
- Detecting incorrect cross-layer dependencies
- Impact mode: select nodes and see which layers are affected (direct, 1-hop, transitive)
- Path Finder: click two nodes to trace the shortest dependency path between them

---

## CLI — visualize any project in one command

```bash
# npm
npx graphmycode

# pnpm
pnpx graphmycode
```

Run this inside any project directory. GraphMyCode will:

1. Compress your code into a `.zip` (ignoring `node_modules`, `.git`, `dist`, etc.)
2. Start a local server on `127.0.0.1` to serve the zip
3. Open [graphmycode.com](https://graphmycode.com) in your browser and load your code automatically

**Your code never leaves your machine.** The zip is served from your own localhost — the website fetches it locally and processes everything in your browser.

> Requires Node.js ≥ 20. No installation needed with `npx` or `pnpx`.

### Examples

```bash
# Visualize the current project
cd ~/projects/my-app
npx graphmycode   # or: pnpx graphmycode

# Visualize any directory
cd ~/projects/my-api
npx graphmycode   # or: pnpx graphmycode
```

---

## Export project context for AI agents

One click generates a `CLAUDE.md` (and optionally `AGENTS.md`) with the most connected nodes, folder structure, external dependencies, and detected code communities — ready to drop into your project so your AI agent starts with full context.

The main advantage: **fewer tokens, better responses.** With the file in place, your agent knows from the first message which files matter most, what each layer does, the stack in use, and the key entry points — without you having to explain it every time.

---

## Optional: AI Q&A

Once the graph is loaded, connect your own AI provider to ask questions in natural language about your codebase. Your API key is stored only in your browser — never sent anywhere except directly to the provider you choose.

| Provider | Platform | Status |
|---|---|---|
| OpenAI (GPT-4o, GPT-4o-mini…) | Cloud | ✅ Supported |
| Azure OpenAI | Cloud | ✅ Supported |
| Anthropic (Claude 3.5, Claude 4…) | Cloud | ✅ Supported |
| Google Gemini (2.0 Flash, 1.5 Pro…) | Cloud | ✅ Supported |
| Ollama (Llama, Mistral, Qwen…) | Local | ✅ Supported |
| OpenRouter | Cloud | ✅ Supported |
| MiniMax | Cloud | ✅ Supported |
| GLM / Z.AI | Cloud | ✅ Supported |

> ⚠️ When using a cloud provider, parts of your code will be sent to that provider. Use **Ollama** to keep everything local.

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
| Architectural layers | Canvas 2D (swim-lane layout) |
| Heatmap | Canvas 2D + graphology-layout-noverlap |
| Code parsing | web-tree-sitter (WASM) |
| Semantic embeddings | @huggingface/transformers (WASM) |
| Community detection | Leiden algorithm |
| Dimensionality reduction | UMAP |

---

## Author

Built by [Francisco Valero](https://github.com/franciscovaleromartin).

---

## License

Copyright (C) 2026 Francisco Valero.

This project is licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE). Free for personal, educational, and non-commercial use. Commercial use is not permitted.

The `gitnexus-shared` dependency is also licensed under PolyForm Noncommercial (© Abhigyan Patwari).
