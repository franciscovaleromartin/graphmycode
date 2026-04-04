# GraphMyCode

**Visualize your codebase as an interactive knowledge graph — entirely in your browser.**

GraphMyCode analyzes your source code and renders it as a navigable graph of files, functions, classes, interfaces, and their relationships. No server uploads. No accounts. Everything runs locally using WebAssembly.

## How it works

Upload a `.zip` of your project or paste a public GitHub URL. GraphMyCode parses your code with [tree-sitter](https://tree-sitter.github.io/tree-sitter/) (via WASM), builds a knowledge graph of symbols and dependencies, and renders it interactively using [Sigma.js](https://www.sigmajs.org/).

Your code never leaves your browser.

## Features

- **Multi-language support** — JavaScript, TypeScript, Python, Java, Go, Rust, C/C++, C#, PHP, Ruby, Swift
- **Knowledge graph** — nodes for files, folders, classes, functions, methods, interfaces, and imports
- **Relationship edges** — imports, calls, inheritance, and membership
- **Community detection** — automatic grouping of related symbols using the Leiden algorithm
- **Cypher queries** — query the graph with a Neo4j-compatible Cypher interface
- **AI highlights** — toggle visual highlights from AI-assisted analysis
- **ZIP upload or GitHub URL** — no git client required

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Styling | Tailwind CSS v4 |
| Graph rendering | Sigma.js + Graphology |
| Code parsing | web-tree-sitter (WASM) |
| Layout | ForceAtlas2, Force-directed |
| Community detection | Leiden algorithm |

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

## Author

Built by [Francisco Valero](https://github.com/franciscovaleromartin).
