// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

import type { KnowledgeGraph } from '../../core/graph/types';

export type GraphNode = KnowledgeGraph['nodes'][number];

export interface BaseData {
  cleanNodes: GraphNode[];
  allCleanNodes: GraphNode[];
  cleanDeps: Record<string, string[]>;
  degreeMap: Map<string, number>;
  nodeById: Map<string, GraphNode>;
  communityMembers: Map<string, GraphNode[]>;
  nodeToCommunity: Map<string, string>;
  testNodeIds: Set<string>;
}

// ── Constants ────────────────────────────────────────────────────────────────

export const PYTHON_STDLIB = new Set([
  'os', 'sys', 're', 'json', 'io', 'time', 'threading', 'logging',
  'collections', 'functools', 'typing', 'pathlib', 'subprocess', 'signal',
  'struct', 'uuid', 'secrets', 'shutil', 'tempfile', 'datetime', 'traceback',
  'contextlib', 'ipaddress', 'socket', 'base64', 'urllib', 'urllib.parse',
  'abc', 'ast', 'asyncio', 'copy', 'csv', 'dataclasses', 'decimal', 'enum',
  'hashlib', 'hmac', 'http', 'inspect', 'itertools', 'math', 'operator',
  'os.path', 'pickle', 'queue', 'random', 'sqlite3', 'ssl', 'stat', 'string',
  'textwrap', 'types', 'unittest', 'warnings', 'weakref', 'zipfile', 'zlib',
  'platform', 'argparse', 'glob', 'heapq', 'html', 'importlib', 'keyword',
  'multiprocessing', 'pprint', 'getpass',
]);

export const FRAMEWORK_PACKAGES: Record<string, string> = {
  react: 'React', next: 'Next.js', vue: 'Vue', svelte: 'Svelte', nuxt: 'Nuxt',
  '@angular/core': 'Angular', vite: 'Vite', astro: 'Astro',
  flask: 'Flask', fastapi: 'FastAPI', django: 'Django', starlette: 'Starlette',
  express: 'Express', fastify: 'Fastify', hono: 'Hono',
  '@nestjs/core': 'NestJS', koa: 'Koa',
  'actix-web': 'Actix', axum: 'Axum', rocket: 'Rocket',
  gin: 'Gin', fiber: 'Fiber',
};

export const PYTHON_BACKEND_FW = new Set(['Flask', 'FastAPI', 'Django', 'Starlette']);
export const JS_FRONTEND_FW = new Set(['React', 'Vue', 'Svelte', 'Angular', 'Next.js', 'Nuxt', 'Astro', 'Vite']);
export const JS_SERVER_FW = new Set(['Express', 'Fastify', 'Hono', 'NestJS', 'Koa']);

export const SKIP_SYMBOL_LABELS = new Set([
  'Community', 'Process', 'Folder', 'Package', 'Project', 'Module', 'Import', 'File',
]);

export const FILE_EXT_RE = /\.(py|js|jsx|ts|tsx|vue|go|rs|java|cs|rb|php|kt|swift|dart|c|cpp|h|hpp)$/i;

export const TEST_PATH_RE = /(?:^|\/)(tests?|__tests__|spec|fixtures?|worked|examples?|demos?|samples?|benchmarks?|perf|performance)(?:\/|$)/i;
export const TEST_FILE_RE = /(?:^|[\\/])(test_[^/]+|[^/]+_test|[^/]+\.(?:test|spec)\.[jt]sx?)$/i;

export const CLUSTER_RE = /^Cluster_\d+$/;

export const ENTRY_FILENAMES: Record<string, string> = {
  'main.py': 'Python entry', 'app.py': 'Flask/FastAPI app', 'server.py': 'HTTP server',
  'cli.py': 'CLI handler', 'wsgi.py': 'WSGI gateway', 'asgi.py': 'ASGI gateway',
  'index.ts': 'module entry', 'index.js': 'module entry',
  'main.ts': 'TS entry', 'server.ts': 'HTTP server', 'server.js': 'HTTP server',
  'main.go': 'Go entry', 'main.rs': 'Rust entry',
};

export const DOC_BASENAMES: Record<string, string> = {
  'architecture.md': 'Architecture', 'ARCHITECTURE.md': 'Architecture',
  'glossary.md': 'Glossary', 'GLOSSARY.md': 'Glossary',
  'CONTRIBUTING.md': 'Contributing', 'ADR.md': 'ADR',
  'DECISIONS.md': 'Decisions', 'API.md': 'API docs',
};

export const DANGEROUS_PATHS: Array<[string, string]> = [
  ['migrations/', 'run migrations via CLI, do not hand-edit'],
  ['generated/', 'regenerate via build pipeline instead'],
  ['dist/', 'run build command instead'],
  ['build/', 'run build command instead'],
];

export const TOOL_PREFIXES = ['execute_', 'call_', 'invoke_', 'search_', 'read_', 'write_', 'fetch_', 'query_', 'list_'];
export const ORCHESTRATOR_PATTERNS = ['dispatch', 'orchestrat', 'spawn', 'invoke_agent', 'run_agent'];
export const WORKER_PATTERNS = ['execute_tool', 'run_tool', 'handle_task', 'process_task'];

// ── Shared helpers ────────────────────────────────────────────────────────────

export function isTestNode(node: { properties: { filePath?: string; name?: string } }): boolean {
  const path = node.properties.filePath ?? node.properties.name ?? '';
  return TEST_PATH_RE.test(path) || TEST_FILE_RE.test(path);
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function getLang(filePath: string, nodeLang?: string): string {
  if (nodeLang) return nodeLang.toLowerCase();
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const extMap: Record<string, string> = {
    py: 'python', ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    go: 'go', rs: 'rust', java: 'java', cs: 'csharp', rb: 'ruby',
    php: 'php', kt: 'kotlin', swift: 'swift', dart: 'dart', c: 'c', cpp: 'cpp',
  };
  return extMap[ext] ?? 'javascript';
}

export function triggerDownload(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
