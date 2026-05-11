// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

import type { KnowledgeGraph } from '../core/graph/types';
import { isSystemFile } from './system-file-filter';

// ── Types ────────────────────────────────────────────────────────────────────

type GraphNode = KnowledgeGraph['nodes'][number];

interface BaseData {
  cleanNodes: GraphNode[];      // excludes test/spec/fixture files
  allCleanNodes: GraphNode[];   // includes test files (used only by Bridge Files)
  cleanDeps: Record<string, string[]>;
  degreeMap: Map<string, number>;
  nodeById: Map<string, GraphNode>;
  communityMembers: Map<string, GraphNode[]>;
  nodeToCommunity: Map<string, string>;
  testNodeIds: Set<string>;     // all node IDs from test files, for Critical Edges filtering
}

// ── Constants ────────────────────────────────────────────────────────────────

const PYTHON_STDLIB = new Set([
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

const FRAMEWORK_PACKAGES: Record<string, string> = {
  react: 'React', next: 'Next.js', vue: 'Vue', svelte: 'Svelte', nuxt: 'Nuxt',
  '@angular/core': 'Angular', vite: 'Vite', astro: 'Astro',
  flask: 'Flask', fastapi: 'FastAPI', django: 'Django', starlette: 'Starlette',
  express: 'Express', fastify: 'Fastify', hono: 'Hono',
  '@nestjs/core': 'NestJS', koa: 'Koa',
  'actix-web': 'Actix', axum: 'Axum', rocket: 'Rocket',
  gin: 'Gin', fiber: 'Fiber',
};

const PYTHON_BACKEND_FW = new Set(['Flask', 'FastAPI', 'Django', 'Starlette']);
const JS_FRONTEND_FW = new Set(['React', 'Vue', 'Svelte', 'Angular', 'Next.js', 'Nuxt', 'Astro', 'Vite']);
const JS_SERVER_FW = new Set(['Express', 'Fastify', 'Hono', 'NestJS', 'Koa']);

const SKIP_SYMBOL_LABELS = new Set([
  'Community', 'Process', 'Folder', 'Package', 'Project', 'Module', 'Import', 'File',
]);

const FILE_EXT_RE = /\.(py|js|jsx|ts|tsx|vue|go|rs|java|cs|rb|php|kt|swift|dart|c|cpp|h|hpp)$/i;

// Matches test/spec/fixture/example paths and filenames — excluded from Key Symbols,
// Module Map and Critical Edges (but NOT from Bridge Files).
const TEST_PATH_RE = /(?:^|\/)(tests?|__tests__|spec|fixtures?|worked|examples?|demos?|samples?)(?:\/|$)/i;
const TEST_FILE_RE = /(?:^|[\\/])(test_[^/]+|[^/]+_test|[^/]+\.(?:test|spec)\.[jt]sx?)$/i;

function isTestNode(node: { properties: { filePath?: string; name?: string } }): boolean {
  const path = node.properties.filePath ?? node.properties.name ?? '';
  return TEST_PATH_RE.test(path) || TEST_FILE_RE.test(path);
}

const CLUSTER_RE = /^Cluster_\d+$/;

const ENTRY_FILENAMES: Record<string, string> = {
  'main.py': 'Python entry', 'app.py': 'Flask/FastAPI app', 'server.py': 'HTTP server',
  'cli.py': 'CLI handler', 'wsgi.py': 'WSGI gateway', 'asgi.py': 'ASGI gateway',
  'index.ts': 'module entry', 'index.js': 'module entry',
  'main.ts': 'TS entry', 'server.ts': 'HTTP server', 'server.js': 'HTTP server',
  'main.go': 'Go entry', 'main.rs': 'Rust entry',
};

const DOC_BASENAMES: Record<string, string> = {
  'architecture.md': 'Architecture', 'ARCHITECTURE.md': 'Architecture',
  'glossary.md': 'Glossary', 'GLOSSARY.md': 'Glossary',
  'CONTRIBUTING.md': 'Contributing', 'ADR.md': 'ADR',
  'DECISIONS.md': 'Decisions', 'API.md': 'API docs',
};

const DANGEROUS_PATHS: Array<[string, string]> = [
  ['migrations/', 'run migrations via CLI, do not hand-edit'],
  ['generated/', 'regenerate via build pipeline instead'],
  ['dist/', 'run build command instead'],
  ['build/', 'run build command instead'],
];

const TOOL_PREFIXES = ['execute_', 'call_', 'invoke_', 'search_', 'read_', 'write_', 'fetch_', 'query_', 'list_'];
const ORCHESTRATOR_PATTERNS = ['dispatch', 'orchestrat', 'spawn', 'invoke_agent', 'run_agent'];
const WORKER_PATTERNS = ['execute_tool', 'run_tool', 'handle_task', 'process_task'];

// ── Helpers ──────────────────────────────────────────────────────────────────

function triggerDownload(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function getLang(filePath: string, nodeLang?: string): string {
  if (nodeLang) return nodeLang.toLowerCase();
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const extMap: Record<string, string> = {
    py: 'python', ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    go: 'go', rs: 'rust', java: 'java', cs: 'csharp', rb: 'ruby',
    php: 'php', kt: 'kotlin', swift: 'swift', dart: 'dart', c: 'c', cpp: 'cpp',
  };
  return extMap[ext] ?? 'javascript';
}

// ── Base data extraction ─────────────────────────────────────────────────────

function buildBase(graph: KnowledgeGraph, externalDeps: Record<string, string[]>): BaseData {
  const systemNodeIds = new Set<string>(
    graph.nodes
      .filter((n) => isSystemFile(n.properties.filePath ?? n.properties.name ?? ''))
      .map((n) => n.id),
  );

  // allCleanNodes is used for Bridge Files (tests can be bridges too).
  // cleanNodes excludes test/spec/fixture files for all other analyses.
  const allCleanNodes = graph.nodes.filter((n) => !systemNodeIds.has(n.id));
  const cleanNodes = allCleanNodes.filter((n) => !isTestNode(n));
  const cleanDeps = Object.fromEntries(
    Object.entries(externalDeps).filter(([id]) => !systemNodeIds.has(id)),
  );

  const degreeMap = new Map<string, number>();
  for (const rel of graph.relationships) {
    degreeMap.set(rel.sourceId, (degreeMap.get(rel.sourceId) ?? 0) + 1);
    degreeMap.set(rel.targetId, (degreeMap.get(rel.targetId) ?? 0) + 1);
  }

  const nodeById = new Map<string, GraphNode>(graph.nodes.map((n) => [n.id, n]));

  const communityMembers = new Map<string, GraphNode[]>();
  const nodeToCommunity = new Map<string, string>();

  for (const rel of graph.relationships) {
    if (rel.type !== 'MEMBER_OF') continue;
    if (systemNodeIds.has(rel.sourceId) || systemNodeIds.has(rel.targetId)) continue;
    if (!communityMembers.has(rel.targetId)) communityMembers.set(rel.targetId, []);
    const member = nodeById.get(rel.sourceId);
    if (member) {
      communityMembers.get(rel.targetId)!.push(member);
      nodeToCommunity.set(rel.sourceId, rel.targetId);
    }
  }

  const testNodeIds = new Set<string>(
    graph.nodes.filter((n) => isTestNode(n)).map((n) => n.id),
  );

  return { cleanNodes, allCleanNodes, cleanDeps, degreeMap, nodeById, communityMembers, nodeToCommunity, testNodeIds };
}

// ── Stack detection ───────────────────────────────────────────────────────────

function detectStack(cleanNodes: GraphNode[], cleanDeps: Record<string, string[]>) {
  const langCounts = new Map<string, number>();
  const fileNames = new Set<string>();

  // Extension → language fallback (GitHub URL input never sets properties.language)
  const EXT_LANG: Record<string, string> = {
    py: 'python', ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    go: 'go', rs: 'rust', java: 'java', cs: 'csharp', rb: 'ruby',
    php: 'php', kt: 'kotlin', swift: 'swift', c: 'c', cpp: 'cpp',
  };

  for (const n of cleanNodes) {
    if (n.label !== 'File') continue;
    const filePath = n.properties.filePath ?? '';
    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
    const lang = (n.properties.language as string | undefined) ?? EXT_LANG[ext];
    if (lang) langCounts.set(lang, (langCounts.get(lang) ?? 0) + 1);
    const base = filePath.split('/').pop() ?? '';
    if (base) fileNames.add(base);
  }

  const primaryLang = [...langCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';

  const allPkgs = new Set(Object.values(cleanDeps).flat().map((p) => p.toLowerCase()));

  const frameworks: string[] = [];
  for (const [pkg, name] of Object.entries(FRAMEWORK_PACKAGES)) {
    if (allPkgs.has(pkg.toLowerCase())) frameworks.push(name);
  }

  const pyBackend = frameworks.filter((f) => PYTHON_BACKEND_FW.has(f));
  const jsFrontend = frameworks.filter((f) => JS_FRONTEND_FW.has(f));
  const jsServer = frameworks.filter((f) => JS_SERVER_FW.has(f));
  const isFullstack = pyBackend.length > 0 && (jsFrontend.length > 0 || jsServer.length > 0);

  // Package managers — detect from config files first (ZIP input)
  let pyPkgManager = '';
  if (fileNames.has('pyproject.toml')) pyPkgManager = 'pyproject';
  else if (fileNames.has('setup.py') || fileNames.has('setup.cfg')) pyPkgManager = 'pip';
  else if (fileNames.has('requirements.txt')) pyPkgManager = 'pip';

  let jsPkgManager = '';
  if (fileNames.has('pnpm-lock.yaml') || fileNames.has('pnpm-lock.yml')) jsPkgManager = 'pnpm';
  else if (fileNames.has('yarn.lock')) jsPkgManager = 'yarn';
  else if (fileNames.has('bun.lockb') || fileNames.has('bun.lock')) jsPkgManager = 'bun';
  else if (fileNames.has('package.json')) jsPkgManager = 'npm';

  // Fallback from externalDeps — GitHub URL input never downloads config files
  const PYTHON_DEP_SIGNAL = new Set([
    'flask', 'fastapi', 'django', 'starlette', 'pytest', 'click', 'typer',
    'anthropic', 'openai', 'langchain', 'numpy', 'pandas', 'requests',
    'aiohttp', 'pydantic', 'sqlalchemy', 'celery', 'boto3', 'httpx',
  ]);
  const JS_DEP_SIGNAL = new Set([
    'react', 'vue', 'svelte', 'next', 'nuxt', 'astro', 'vite',
    'express', 'fastify', 'hono', '@nestjs/core', 'koa',
    'axios', 'zod', 'prisma', 'drizzle-orm',
  ]);

  if (!pyPkgManager && [...allPkgs].some((p) => PYTHON_DEP_SIGNAL.has(p))) pyPkgManager = 'pip';
  if (!jsPkgManager && [...allPkgs].some((p) => JS_DEP_SIGNAL.has(p))) jsPkgManager = 'npm';

  let pkgManager: string;
  if (isFullstack) {
    pkgManager = [pyPkgManager, jsPkgManager].filter(Boolean).join(' + ');
  } else if (pyPkgManager) {
    pkgManager = pyPkgManager;
  } else if (jsPkgManager) {
    pkgManager = jsPkgManager;
  } else if (fileNames.has('Cargo.toml')) {
    pkgManager = 'cargo';
  } else if (fileNames.has('go.mod')) {
    pkgManager = 'go';
  } else if (fileNames.has('Gemfile')) {
    pkgManager = 'bundler';
  } else {
    pkgManager = '';
  }

  let runtime: string;
  if (isFullstack) {
    runtime = 'browser + server';
  } else if (jsFrontend.length > 0 && frameworks.some((f) => ['Next.js', 'Nuxt'].includes(f))) {
    runtime = 'browser + server';
  } else if (jsFrontend.length > 0) {
    runtime = 'browser';
  } else if (pyBackend.length > 0 || jsServer.length > 0) {
    runtime = 'server';
  } else if (primaryLang === 'python' && !jsPkgManager) {
    // Pure Python: server if web framework or wsgi/asgi detected, otherwise CLI
    const hasWsgiFiles = fileNames.has('wsgi.py') || fileNames.has('asgi.py');
    runtime = (hasWsgiFiles || pyBackend.length > 0) ? 'server' : 'CLI';
  } else if (['go', 'rust'].includes(primaryLang)) {
    runtime = 'server';
  } else if (allPkgs.has('aws-lambda-powertools') || allPkgs.has('@aws-sdk/client-lambda')) {
    runtime = 'lambda';
  } else {
    runtime = '';
  }

  // Map internal tokens to display names
  const pkgManagerDisplay: Record<string, string> = {
    pyproject: 'pip', pip: 'pip', uv: 'uv',
    npm: 'npm', yarn: 'yarn', pnpm: 'pnpm', bun: 'bun',
    cargo: 'cargo', go: 'go', bundler: 'bundler',
  };
  const displayPm = pkgManager
    .split(' + ')
    .map((p) => pkgManagerDisplay[p] ?? p)
    .join(' + ');

  const LANG_CAPS: Record<string, string> = {
    python: 'Python', typescript: 'TypeScript', javascript: 'JavaScript',
    java: 'Java', go: 'Go', rust: 'Rust', csharp: 'C#', cpp: 'C++',
    c: 'C', ruby: 'Ruby', php: 'PHP', kotlin: 'Kotlin', swift: 'Swift', dart: 'Dart',
  };
  const displayLang = LANG_CAPS[primaryLang] ?? (primaryLang ? primaryLang.charAt(0).toUpperCase() + primaryLang.slice(1) : '');

  let stackLine: string;
  if (isFullstack) {
    const backendStr = `Python/${pyBackend[0]}`;
    const frontendStr = (jsFrontend[0] ?? jsServer[0]) ?? '';
    stackLine = [backendStr + (frontendStr ? ` + ${frontendStr}` : ''), displayPm, runtime]
      .filter(Boolean).join(' • ');
  } else {
    const fwStr = frameworks.slice(0, 2).join(' + ');
    stackLine = [displayLang, fwStr, displayPm, runtime].filter(Boolean).join(' • ');
  }

  return {
    primaryLang, frameworks, pyBackend, jsFrontend, jsServer,
    isFullstack, pkgManager, pyPkgManager, jsPkgManager,
    runtime, fileNames, allPkgs, stackLine,
  };
}

// ── Commands ──────────────────────────────────────────────────────────────────

function inferCommands(
  stack: ReturnType<typeof detectStack>,
): Record<string, string | undefined> {
  const { isFullstack, pyBackend, pyPkgManager, jsPkgManager, primaryLang, fileNames } = stack;

  if (isFullstack) {
    const jsRun = jsPkgManager === 'npm' ? 'npm run' : `${jsPkgManager} run`;
    const jsInstall = jsPkgManager === 'npm' ? 'npm install' : `${jsPkgManager} install`;
    const pyInstall = pyPkgManager === 'uv' ? 'uv sync' : 'pip install -r requirements.txt';

    let serverCmd = 'python app.py';
    if (fileNames.has('wsgi.py')) serverCmd = 'python wsgi.py';
    else if (fileNames.has('asgi.py')) serverCmd = 'python asgi.py';
    else if (fileNames.has('app.py') && pyBackend.includes('Flask')) serverCmd = 'flask run';
    else if (fileNames.has('app.py')) serverCmd = 'python app.py';
    else if (fileNames.has('main.py')) serverCmd = 'python main.py';

    return {
      install: `${pyInstall} && ${jsInstall}`,
      dev: `${jsRun} dev`,
      server: serverCmd,
      test: `pytest && ${jsRun} test`,
      lint: `ruff check . && ${jsRun} lint`,
      build: `${jsRun} build`,
    };
  }

  if (jsPkgManager) {
    const run = jsPkgManager === 'npm' ? 'npm run' : `${jsPkgManager} run`;
    const install = jsPkgManager === 'npm' ? 'npm install' : `${jsPkgManager} install`;
    return { install, dev: `${run} dev`, test: `${run} test`, lint: `${run} lint`, build: `${run} build` };
  }

  if (primaryLang === 'python' || pyPkgManager) {
    let install: string;
    let build: string;
    if (pyPkgManager === 'pyproject') {
      install = 'pip install -e .';
      build = 'python -m build';
    } else if (pyPkgManager === 'uv') {
      install = 'uv sync';
      build = '# n/a';
    } else {
      install = 'pip install -r requirements.txt';
      build = '# n/a';
    }
    let dev = '# check project docs';
    if (fileNames.has('wsgi.py')) dev = 'python wsgi.py';
    else if (fileNames.has('asgi.py')) dev = 'python asgi.py';
    else if (fileNames.has('app.py')) dev = 'flask run';
    else if (fileNames.has('main.py')) dev = 'python main.py';
    else if (fileNames.has('server.py')) dev = 'python server.py';
    return { install, dev, test: 'pytest', lint: 'ruff check .', build };
  }

  if (stack.pkgManager === 'cargo') {
    return { install: '# implicit', dev: 'cargo run', test: 'cargo test', lint: 'cargo clippy', build: 'cargo build --release' };
  }

  if (stack.pkgManager === 'go') {
    return { install: 'go mod download', dev: 'go run .', test: 'go test ./...', lint: 'golangci-lint run', build: 'go build -o bin/app .' };
  }

  return { install: '# see manifest', dev: '# see manifest', test: '# see manifest', lint: '# see manifest', build: '# see manifest' };
}

// ── Entry Points ──────────────────────────────────────────────────────────────

function findEntryPoints(cleanNodes: GraphNode[], graph: KnowledgeGraph) {
  const entries: Array<{ path: string; role: string }> = [];
  const seen = new Set<string>();

  const entryIds = new Set<string>(
    graph.relationships.filter((r) => r.type === 'ENTRY_POINT_OF').map((r) => r.sourceId),
  );

  for (const n of cleanNodes) {
    const path = n.properties.filePath ?? n.properties.name ?? '';
    if (seen.has(path) || !path) continue;

    if (n.label === 'Route') {
      entries.push({ path, role: `HTTP route: ${n.properties.name ?? ''}` });
      seen.add(path);
      continue;
    }

    if (entryIds.has(n.id)) {
      const reason = n.properties.entryPointReason as string | undefined;
      entries.push({ path, role: reason ?? 'entry point' });
      seen.add(path);
    }
  }

  if (entries.length === 0) {
    for (const n of cleanNodes) {
      if (n.label !== 'File') continue;
      const base = (n.properties.filePath ?? '').split('/').pop() ?? '';
      const path = n.properties.filePath ?? base;
      if (ENTRY_FILENAMES[base] && !seen.has(path)) {
        entries.push({ path, role: ENTRY_FILENAMES[base] });
        seen.add(path);
      }
    }
  }

  return entries.slice(0, 5);
}

// ── Module Map ────────────────────────────────────────────────────────────────

const SYMBOL_PREFERRED = new Set(['Class', 'Interface', 'Function', 'Method', 'Struct', 'Trait', 'Enum']);
const INTERNAL_ID_RE = /^[a-f0-9]{8,}-|^comm_\d+$|^node_\d+$|^cluster_\d+$/i;

// Returns a deduplicated display label for each community ID.
// Communities are sorted by symbolCount desc so the largest keeps the clean name;
// duplicates get a ·2, ·3 suffix. Used identically by Module Map and Bridge Files.
function buildCommunityLabelMap(
  cleanNodes: GraphNode[],
  _degreeMap: Map<string, number>,
  communityMembers: Map<string, GraphNode[]>,
): Map<string, string> {
  // Collect and sort by symbolCount desc so the biggest community wins the clean name
  const entries = cleanNodes
    .filter((n) => n.label === 'Community')
    .map((n) => ({
      id: n.id,
      rawName: (n.properties.name ?? n.properties.heuristicLabel ?? n.id) as string,
      symbolCount: (n.properties.symbolCount as number | undefined)
        ?? (communityMembers.get(n.id)?.length ?? 0),
    }))
    .sort((a, b) => b.symbolCount - a.symbolCount);

  const TEST_COMMUNITY_RE = /^tests?$|^spec$|^fixtures?$|^__tests__$/i;
  // Noise communities (examples, demos, raw data…) are merged into "Other"
  const NOISE_COMMUNITY_RE = /^raw$|^examples?$|^demos?$|^samples?$|^worked$/i;

  const nameCount = new Map<string, number>(); // base name → times seen so far
  const labels = new Map<string, string>();    // communityId → final label
  let testSymbolTotal = 0;

  for (const { id, rawName, symbolCount } of entries) {
    // Test communities: collapse into "Tests" entry at bottom of Module Map
    if (TEST_COMMUNITY_RE.test(rawName)) {
      testSymbolTotal += symbolCount;
      labels.set(id, '__test__');
      continue;
    }

    // Noise communities: add to Other bucket in Module Map
    if (NOISE_COMMUNITY_RE.test(rawName)) {
      labels.set(id, '__other__');
      continue;
    }

    // Unnamed / Cluster_N communities all collapse to 'Uncategorized' — no suffix.
    const isNamed = rawName && !CLUSTER_RE.test(rawName) && !INTERNAL_ID_RE.test(rawName);
    if (!isNamed) {
      labels.set(id, 'Uncategorized');
      continue;
    }

    const seen = nameCount.get(rawName) ?? 0;
    nameCount.set(rawName, seen + 1);
    labels.set(id, seen === 0 ? rawName : `${rawName}·${seen + 1}`);
  }

  // __test__ sentinel is resolved in buildModuleMap; drop to Uncategorized for Bridge Files
  if (testSymbolTotal === 0) {
    for (const [id, lbl] of labels) {
      if (lbl === '__test__') labels.set(id, 'Uncategorized');
    }
  }

  return labels;
}

function buildModuleMap(
  cleanNodes: GraphNode[],
  degreeMap: Map<string, number>,
  communityMembers: Map<string, GraphNode[]>,
  communityLabelMap: Map<string, string>,
): string {
  const communities = cleanNodes.filter((n) => n.label === 'Community');
  if (communities.length === 0) return '';

  const rows: Array<{ label: string; count: number; purpose: string; keyFile: string }> = [];

  let testTotal = 0;
  let noiseTotal = 0;

  for (const comm of communities) {
    const label = communityLabelMap.get(comm.id);
    if (!label || label === 'Uncategorized') continue;

    const members = communityMembers.get(comm.id) ?? [];
    const symbolCount = (comm.properties.symbolCount as number | undefined) ?? members.length;
    if (symbolCount === 0 && members.length === 0) continue;

    // Aggregate test communities — one entry appended at the end
    if (label === '__test__') {
      testTotal += symbolCount;
      continue;
    }

    // Aggregate noise communities (examples/demo/raw/worked) into Other
    if (label === '__other__') {
      noiseTotal += symbolCount;
      continue;
    }

    const keyFileNode = members
      .filter((n) => n.label === 'File')
      .map((n) => ({ node: n, degree: degreeMap.get(n.id) ?? 0 }))
      .sort((a, b) => b.degree - a.degree)[0]?.node;

    const keyFile = keyFileNode?.properties.filePath ?? '';

    const purpose =
      (comm.properties.description as string | undefined) ??
      (Array.isArray(comm.properties.keywords)
        ? (comm.properties.keywords as string[]).slice(0, 4).join(', ')
        : '');

    rows.push({ label, count: symbolCount, purpose, keyFile });
  }

  rows.sort((a, b) => b.count - a.count);
  const top = rows.slice(0, 6);
  const rest = rows.slice(6);

  const otherCount = rest.reduce((s, r) => s + r.count, 0) + noiseTotal;
  if (otherCount > 0) {
    top.push({ label: 'Other', count: otherCount, purpose: '', keyFile: '' });
  }

  // Single "Tests" entry always at the end, after Other
  if (testTotal > 0) {
    top.push({ label: 'Tests', count: testTotal, purpose: '', keyFile: '' });
  }

  return top
    .map(({ label, count, purpose, keyFile }) => {
      let line = `- **${label}** (${count} symbols)`;
      if (purpose) line += ` — ${purpose}`;
      if (keyFile) line += `; key file \`${keyFile}\``;
      return line;
    })
    .join('\n');
}

// ── Key Symbols ───────────────────────────────────────────────────────────────

function renderSig(node: GraphNode, lang: string): string {
  const name = (node.properties.name ?? node.id) as string;
  const rawRet = node.properties.returnType as string | undefined;
  const ret = rawRet && rawRet !== 'undefined' ? rawRet : undefined;
  const isAsync = node.properties.isAsync as boolean | undefined;
  const label = node.label;
  const async_ = isAsync ? 'async ' : '';

  if (lang === 'python') {
    if (label === 'Class') return `class ${name}: ...`;
    if (label === 'Function' || label === 'Method') {
      return `  ${async_}def ${name}(...)${ret ? ` -> ${ret}` : ''}: ...`;
    }
  } else if (lang === 'go') {
    if (label === 'Function' || label === 'Method') return `func ${name}(...)${ret ? ` ${ret}` : ''} { ... }`;
    if (label === 'Interface') return `type ${name} interface { ... }`;
    if (label === 'Struct') return `type ${name} struct { ... }`;
  } else if (lang === 'rust') {
    if (label === 'Function' || label === 'Method') return `fn ${name}(...)${ret ? ` -> ${ret}` : ''} { ... }`;
    if (label === 'Struct') return `struct ${name} { ... }`;
    if (label === 'Trait') return `trait ${name} { ... }`;
  } else if (lang === 'java' || lang === 'kotlin') {
    if (label === 'Class') return `class ${name} { ... }`;
    if (label === 'Function' || label === 'Method') return `  ${ret ?? 'void'} ${name}(...) { ... }`;
    if (label === 'Interface') return `interface ${name} { ... }`;
  } else {
    // TypeScript / JavaScript / default
    if (label === 'Class') return `class ${name} { ... }`;
    if (label === 'Interface') return `interface ${name} { ... }`;
    if (label === 'TypeAlias' || label === 'Type') return `type ${name} = ...`;
    if (label === 'Enum') return `enum ${name} { ... }`;
    if (label === 'Function') return `  ${async_}function ${name}(...)${ret ? `: ${ret}` : ''} { ... }`;
    if (label === 'Method') return `  ${async_}${name}(...)${ret ? `: ${ret}` : ''} { ... }`;
  }

  return `  ${name}: ...`;
}

function buildKeySymbols(cleanNodes: GraphNode[], degreeMap: Map<string, number>, maxNodes = 12): string {
  const top = cleanNodes
    .filter((n) => !SKIP_SYMBOL_LABELS.has(n.label) && !FILE_EXT_RE.test(n.properties.name ?? ''))
    .map((n) => ({ node: n, degree: degreeMap.get(n.id) ?? 0 }))
    .sort((a, b) => b.degree - a.degree)
    .slice(0, maxNodes);

  if (top.length === 0) return '(no symbols detected)';

  const byFile = new Map<string, typeof top>();
  for (const entry of top) {
    const fp = entry.node.properties.filePath ?? '(unknown)';
    if (!byFile.has(fp)) byFile.set(fp, []);
    byFile.get(fp)!.push(entry);
  }

  const lines: string[] = [];
  for (const [fp, entries] of byFile) {
    lines.push(`\`${fp}\`:`);
    for (const { node } of entries) {
      const lang = getLang(fp, node.properties.language as string | undefined);
      lines.push(renderSig(node, lang));
    }
  }

  return lines.join('\n');
}

// ── Critical Edges ────────────────────────────────────────────────────────────

function buildCriticalEdges(
  graph: KnowledgeGraph,
  nodeById: Map<string, GraphNode>,
  testNodeIds: Set<string>,
): string[] {
  const callers = new Map<string, Set<string>>();
  for (const rel of graph.relationships) {
    if (rel.type !== 'CALLS') continue;
    if (testNodeIds.has(rel.sourceId) || testNodeIds.has(rel.targetId)) continue;
    if (!callers.has(rel.targetId)) callers.set(rel.targetId, new Set());
    callers.get(rel.targetId)!.add(rel.sourceId);
  }

  return [...callers.entries()]
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 5)
    .map(([targetId, callerSet]) => {
      const target = nodeById.get(targetId);
      const name = (target?.properties.name ?? targetId) as string;
      const file = (target?.properties.filePath ?? '').split('/').pop()?.replace(/\.(ts|tsx|js|jsx|py|go|rs)$/, '') ?? '';

      const callerDirs = new Set(
        [...callerSet]
          .map((cid) => {
            const path = nodeById.get(cid)?.properties.filePath as string | undefined ?? '';
            return path.split('/').slice(0, -1).join('/') || path;
          })
          .filter(Boolean),
      );

      const context = callerDirs.size === 1
        ? `across \`${[...callerDirs][0]}/*\``
        : `across ${callerDirs.size} modules`;

      return `- \`${file ? `${file}.` : ''}${name}\` ← ${callerSet.size} callers ${context}`;
    });
}

// ── Bridge Files ──────────────────────────────────────────────────────────────

// Resolves the community of any node:
// - Symbols (Function/Class/Method/Interface): direct MEMBER_OF lookup.
// - File nodes: no MEMBER_OF edge exists (Leiden excludes Files), so look at
//   the symbols the file CONTAINS and return the most frequent community among them.
function resolveNodeCommunity(
  nodeId: string,
  nodeToCommunity: Map<string, string>,
  graph: KnowledgeGraph,
): string | undefined {
  const direct = nodeToCommunity.get(nodeId);
  if (direct) return direct;

  const memberCommunities: string[] = [];
  for (const rel of graph.relationships) {
    if (rel.type === 'CONTAINS' && rel.sourceId === nodeId) {
      const symbolCommunity = nodeToCommunity.get(rel.targetId);
      if (symbolCommunity) memberCommunities.push(symbolCommunity);
    }
  }
  if (memberCommunities.length === 0) return undefined;

  const freq = new Map<string, number>();
  for (const c of memberCommunities) freq.set(c, (freq.get(c) ?? 0) + 1);
  return [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function buildBridgeFiles(
  cleanNodes: GraphNode[],
  graph: KnowledgeGraph,
  degreeMap: Map<string, number>,
  nodeToCommunity: Map<string, string>,
  communityLabelMap: Map<string, string>,
): string[] {
  // Build bidirectional neighbor map for bridge candidate detection
  const neighbors = new Map<string, Set<string>>();
  for (const rel of graph.relationships) {
    if (!neighbors.has(rel.sourceId)) neighbors.set(rel.sourceId, new Set());
    if (!neighbors.has(rel.targetId)) neighbors.set(rel.targetId, new Set());
    neighbors.get(rel.sourceId)!.add(rel.targetId);
    neighbors.get(rel.targetId)!.add(rel.sourceId);
  }

  const bridges: Array<{ path: string; degree: number; labelA: string; labelB: string }> = [];

  for (const node of cleanNodes) {
    if (node.label !== 'File') continue;
    const degree = degreeMap.get(node.id) ?? 0;
    if (degree < 2) continue;

    // For each neighbor, resolve its community using CONTAINS-aware lookup.
    // Neighbors without a resolvable community are silently skipped.
    const neighborCommIds = new Set<string>();
    for (const nid of neighbors.get(node.id) ?? []) {
      const commId = resolveNodeCommunity(nid, nodeToCommunity, graph);
      if (commId) neighborCommIds.add(commId);
    }

    if (neighborCommIds.size < 2) continue;

    // Map community IDs to display labels — same filter as Module Map:
    // skip undefined (orphan/singleton comm IDs) and 'Uncategorized' (Cluster_N)
    const resolvedLabels = [...neighborCommIds]
      .map((id) => communityLabelMap.get(id))
      .filter((l): l is string => !!l && l !== 'Uncategorized');

    // Compare BASE names (strip ·N suffix) so Backend ↔ Backend·2 is not a bridge.
    // A real bridge connects functionally distinct communities (Backend ↔ Components).
    const uniqueBases = [...new Set(resolvedLabels.map((l) => l.replace(/·\d+$/, '')))];
    if (uniqueBases.length < 2) continue;

    bridges.push({
      path: node.properties.filePath ?? node.id,
      degree,
      labelA: uniqueBases[0],
      labelB: uniqueBases[1],
    });
  }

  return bridges
    .sort((a, b) => b.degree - a.degree)
    .slice(0, 3)
    .map(({ path, labelA, labelB }) => `- \`${path}\` — connects ${labelA} ↔ ${labelB}`);
}

// ── Purpose inference ────────────────────────────────────────────────────────

interface PurposeSignals {
  domain: string | undefined;   // primary domain ("RAG", "AI", "e-commerce"…)
  components: string[];         // named tech to list after "with … and …"
  hasAuth: boolean;
}

const CHAT_DEP_RE = /flask.socketio|socket\.io|twilio|sendgrid|pusher/i;
const AUTH_PATTERN = /\b(auth|login|logout|signup|signin|permission|role|session|token|jwt|password|credential)\b/i;
const AUTH_DEP_RE = /flask.login|flask.security|authlib|python.jose|passlib|bcrypt|passport|next.auth|@auth\/|clerk|supabase.auth|lucia/i;

function inferPurposeSignals(
  cleanNodes: GraphNode[],
  allDeps: Set<string> = new Set(),
): PurposeSignals | undefined {
  const symbols = cleanNodes.filter(
    (n) => n.label === 'Function' || n.label === 'Class' || n.label === 'Method',
  );
  if (symbols.length < 10) return undefined;

  // Returns true when ≥minCount symbol names match re
  const hits = (re: RegExp, min = 2): boolean => {
    let n = 0;
    for (const s of symbols) {
      if (re.test(s.properties.name ?? '') && ++n >= min) return true;
    }
    return false;
  };
  const depHas = (re: RegExp): boolean =>
    [...allDeps].some((d) => re.test(d.toLowerCase()));

  let domain: string | undefined;
  const components: string[] = [];

  // ── Vector DBs / RAG — names take priority, deps as fallback ─────────────
  const hasPinecone = hits(/pinecone/i, 1) || depHas(/pinecone/);
  const hasWeaviate = hits(/weaviate/i, 1) || depHas(/weaviate/);
  const hasChroma   = hits(/\bchroma\b/i, 1) || depHas(/chroma/);
  const hasQdrant   = hits(/qdrant/i, 1) || depHas(/qdrant/);
  const hasRAGNames = hits(/\b(rag|retriev|embed|chunk|ingest)\b/i, 2);

  if (hasPinecone) components.push('Pinecone vector search');
  if (hasWeaviate) components.push('Weaviate vector search');
  if (hasChroma)   components.push('Chroma vector store');
  if (hasQdrant)   components.push('Qdrant vector search');
  if (hasRAGNames || hasPinecone || hasWeaviate || hasChroma || hasQdrant) domain = 'RAG';

  // ── Audio / TTS ───────────────────────────────────────────────────────────
  if (hits(/elevenlabs|tts|\bspeech\b|audio_gen/i, 1) || depHas(/elevenlabs/)) {
    components.push('ElevenLabs audio generation');
  }

  // ── Payments ──────────────────────────────────────────────────────────────
  if (hits(/\b(stripe|payment|checkout|billing|subscription)\b/i, 2) || depHas(/stripe/)) {
    components.push('Stripe payments');
  }

  // ── Code tooling / graph analysis — checked BEFORE generic AI so specifics win ─
  if (!domain) {
    // Graph signal: cluster, deduplicate, entity connections, community detection…
    const hasGraphSignal = hits(
      /\b(cluster|community|node_map|edge_data|graph|adjacen|degree|centrality|dedup|connect|entit|similar)\b/i,
      2,
    );
    // Code signal: AST, call flow, tree-sitter, syntax analysis…
    const hasCodeSignal = hits(
      /\b(parse|ast|callflow|call_flow|tree_sitter|syntax|token|grammar|visitor|walker)\b/i,
      1,
    );
    // Builder/exporter signal: generate outputs, export formats…
    const hasBuildSignal = hits(
      /\b(build_from|generate|export|to_html|to_wiki|render|serialize)\b/i,
      1,
    );

    if      (hasGraphSignal && hasCodeSignal) domain = 'code knowledge graph';
    else if (hasGraphSignal && hasBuildSignal) domain = 'knowledge graph builder';
    else if (hasGraphSignal)                  domain = 'knowledge graph';
    else if (hasCodeSignal && hasBuildSignal) domain = 'code analysis and generation';
    else if (hasCodeSignal)                   domain = 'code analysis';
  }

  // ── AI / LLM — only fires when no specific domain was found above ─────────
  if (!domain) {
    const hasAI =
      hits(/\b(openai|anthropic|claude|gpt|llm|completion|generate_text)\b/i, 2)
      || depHas(/openai|anthropic|groq|mistral|cohere/);
    if (hasAI) domain = 'AI';
  }

  // ── Generic domains — each requires ≥3 matching function names ────────────
  if (!domain) {
    if      (hits(/galler|photo|album|thumbnail|carousel/i, 3))                  domain = 'photo gallery';
    else if (hits(/ecomm|product|cart|order|inventory|shop|catalog/i, 3))        domain = 'e-commerce';
    else if (hits(/blog|post|article|publish|comment|markdown/i, 3))             domain = 'content management';
    else if (hits(/task|todo|sprint|kanban|board|ticket/i, 3))                   domain = 'project management';
    else if (hits(/dashboard|metric|analytic|report|chart|stat|kpi/i, 3))        domain = 'analytics dashboard';
    else if (hits(/map|location|geo|marker|route|coordinate/i, 3))               domain = 'mapping';
    else if (hits(/video|stream|player|playlist|episode/i, 3))                   domain = 'video streaming';
    else if (depHas(CHAT_DEP_RE) && hits(/\b(chat|message|inbox|thread|conversation|dm)\b/i, 3))
      domain = 'chat';
  }

  // Auth: requires auth dep OR ≥3 matching function names — a single "auth" node is not enough
  const authDep = [...allDeps].some((d) => AUTH_DEP_RE.test(d.toLowerCase()));
  const authNameCount = symbols.filter((n) => AUTH_PATTERN.test(n.properties.name ?? '')).length;
  const hasAuth = authDep || authNameCount >= 3;

  if (!domain && components.length === 0 && !hasAuth) return undefined;
  return { domain, components, hasAuth };
}

// ── Boundaries ────────────────────────────────────────────────────────────────

function detectBoundaries(cleanNodes: GraphNode[]): string[] {
  const found = new Set<string>();
  const lines: string[] = [];
  let hasDotEnv = false;

  for (const n of cleanNodes) {
    if (n.label !== 'File' && n.label !== 'Folder') continue;
    const path = n.properties.filePath ?? '';
    const base = path.split('/').pop() ?? '';

    if (!hasDotEnv && (base.startsWith('.env') || base.endsWith('.env'))) {
      hasDotEnv = true;
      lines.push('- Never commit `*.env` files');
    }

    for (const [pattern, advice] of DANGEROUS_PATHS) {
      if (!found.has(pattern) && path.includes(pattern)) {
        found.add(pattern);
        lines.push(`- Never edit \`${pattern}\`; ${advice}`);
      }
    }
  }

  return lines;
}

// ── Pointers ──────────────────────────────────────────────────────────────────

function detectPointers(cleanNodes: GraphNode[]): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];

  for (const n of cleanNodes) {
    if (n.label !== 'File') continue;
    const path = n.properties.filePath ?? '';
    const base = path.split('/').pop() ?? '';
    if (DOC_BASENAMES[base] && !seen.has(base)) {
      seen.add(base);
      lines.push(`- ${DOC_BASENAMES[base]}: \`${path}\``);
    }
  }

  return lines;
}

// ── CLAUDE.md builder ─────────────────────────────────────────────────────────

function assembleClaude(parts: Record<string, string>): string {
  return [
    '<!-- graphmycode:generated-start -->',
    parts.header,
    parts.stack,
    parts.commands,
    parts.entries,
    parts.moduleMap,
    parts.keySymbols,
    parts.criticalEdges,
    parts.bridgeFiles,
    parts.conventions,
    parts.boundaries,
    parts.pointers,
    '<!-- graphmycode:generated-end -->',
  ].filter(Boolean).join('\n\n');
}

function buildClaudeMd(
  graph: KnowledgeGraph,
  projectName: string,
  base: BaseData,
): string {
  const { cleanNodes, allCleanNodes, cleanDeps, degreeMap, nodeById, communityMembers, nodeToCommunity, testNodeIds } = base;

  const stack = detectStack(cleanNodes, cleanDeps);
  const commands = inferCommands(stack);
  const communityLabelMap = buildCommunityLabelMap(cleanNodes, degreeMap, communityMembers);

  // Restrict Bridge Files to only the top 6 communities visible in Module Map.
  // communityLabelMap covers ALL 17+ communities; communities that fall into "Other"
  // have valid labels in the map but are not shown — Bridge Files must not use them.
  const visibleLabelMap: Map<string, string> = new Map(
    cleanNodes
      .filter((n) => n.label === 'Community')
      .map((n) => ({
        id: n.id,
        label: communityLabelMap.get(n.id),
        symbolCount: (n.properties.symbolCount as number | undefined)
          ?? (communityMembers.get(n.id)?.length ?? 0),
      }))
      .filter((e): e is { id: string; label: string; symbolCount: number } =>
        !!e.label && e.label !== 'Uncategorized')
      .sort((a, b) => b.symbolCount - a.symbolCount)
      .slice(0, 6)
      .map((e) => [e.id, e.label]),
  );

  const entries = findEntryPoints(cleanNodes, graph);
  const moduleMapContent = buildModuleMap(cleanNodes, degreeMap, communityMembers, communityLabelMap);
  let keySymbolsContent = buildKeySymbols(cleanNodes, degreeMap, 12);
  let criticalEdgeLines = buildCriticalEdges(graph, nodeById, testNodeIds);
  let bridgeFileLines = buildBridgeFiles(allCleanNodes, graph, degreeMap, nodeToCommunity, visibleLabelMap);
  const boundaryLines = detectBoundaries(cleanNodes);
  const pointerLines = detectPointers(cleanNodes);

  // Purpose: explicit description → domain inference from node names → stack fallback
  const projectNode = cleanNodes.find((n) => n.label === 'Project');
  let purpose = projectNode?.properties.description as string | undefined;
  if (!purpose) {
    const signals = inferPurposeSignals(cleanNodes, stack.allPkgs);

    // Language display names (proper capitalization for purpose line)
    const LANG_DISPLAY: Record<string, string> = {
      python: 'Python', typescript: 'TypeScript', javascript: 'JavaScript',
      java: 'Java', go: 'Go', rust: 'Rust', csharp: 'C#', cpp: 'C++',
      c: 'C', ruby: 'Ruby', php: 'PHP', kotlin: 'Kotlin', swift: 'Swift', dart: 'Dart',
    };
    const langDisplay = LANG_DISPLAY[stack.primaryLang] ?? stack.primaryLang;

    // Build a short stack prefix for the purpose line
    const stackPrefix = stack.isFullstack
      ? [stack.pyBackend[0] ?? langDisplay, stack.jsFrontend[0] ?? stack.jsServer[0] ?? '']
          .filter(Boolean).join(' + ')
      : (stack.frameworks.slice(0, 2).join(' + ') || langDisplay);

    if (signals) {
      const withItems = [
        ...signals.components,
        signals.hasAuth ? 'authentication' : '',
      ].filter(Boolean);
      const withClause = withItems.length > 0
        ? ` with ${withItems[0]}${withItems.slice(1).map((c) => ` and ${c}`).join('')}`
        : '';
      const domainPart = signals.domain ? `${signals.domain} ` : '';
      purpose = stackPrefix
        ? `${stackPrefix} ${domainPart}application${withClause}`
        : `${domainPart}application${withClause}`;
    } else if (stack.isFullstack) {
      const backendFw = stack.pyBackend[0] ?? langDisplay;
      const frontendFw = stack.jsFrontend[0] ?? stack.jsServer[0] ?? '';
      purpose = frontendFw
        ? `Fullstack ${backendFw} + ${frontendFw} application`
        : `${backendFw} application`;
    } else if (stack.frameworks.length > 0) {
      purpose = `A ${stack.frameworks.slice(0, 2).join(' + ')} application.`;
    } else if (stack.primaryLang) {
      purpose = `A ${langDisplay} project.`;
    } else {
      purpose = 'A software project.';
    }
  }

  const commandLines = [
    '## Commands',
    `- install: \`${commands.install ?? '# see manifest'}\``,
    `- dev:     \`${commands.dev ?? '# see manifest'}\``,
    commands.server ? `- server:  \`${commands.server}\`` : '',
    `- test:    \`${commands.test ?? '# see manifest'}\``,
    `- lint:    \`${commands.lint ?? '# see manifest'}\``,
    `- build:   \`${commands.build ?? '# see manifest'}\``,
  ].filter(Boolean).join('\n');

  const boundariesContent = boundaryLines.length > 0
    ? boundaryLines.join('\n')
    : '<!-- add project-specific boundaries here -->';

  const parts: Record<string, string> = {
    header: `# ${projectName}\n> ${purpose}`,
    stack: `## Stack\n- ${stack.stackLine || '(not detected)'}`,
    commands: commandLines,
    entries: entries.length
      ? `## Entry Points\n${entries.map((e) => `- \`${e.path}\` — ${e.role}`).join('\n')}`
      : '',
    moduleMap: moduleMapContent ? `## Module Map\n${moduleMapContent}` : '',
    keySymbols: `## Key Symbols  (signatures only — no implementations)\n${keySymbolsContent}`,
    criticalEdges: criticalEdgeLines.length
      ? `## Critical Edges  (top 5 call relationships)\n${criticalEdgeLines.join('\n')}`
      : '',
    bridgeFiles: bridgeFileLines.length
      ? `## Bridge Files  (high degree across communities — edit carefully)\n${bridgeFileLines.join('\n')}`
      : '',
    conventions: '## Conventions  (not enforced by linters)\n<!-- add project-specific conventions here -->',
    boundaries: `## Boundaries  (DO NOT)\n${boundariesContent}`,
    pointers: pointerLines.length ? `## Pointers  (read on demand, do not embed)\n${pointerLines.join('\n')}` : '',
  };

  let content = assembleClaude(parts);

  // Enforce 1,800-token ceiling: trim in spec-prescribed order
  if (estimateTokens(content) > 1800) {
    parts.criticalEdges = '';
    content = assembleClaude(parts);
  }
  if (estimateTokens(content) > 1800) {
    parts.bridgeFiles = '';
    content = assembleClaude(parts);
  }
  if (estimateTokens(content) > 1800) {
    keySymbolsContent = buildKeySymbols(cleanNodes, degreeMap, 8);
    parts.keySymbols = `## Key Symbols  (signatures only — no implementations)\n${keySymbolsContent}`;
    content = assembleClaude(parts);
  }

  return content;
}

// ── AGENTS.md helpers ────────────────────────────────────────────────────────

const VERB_FORMS: Record<string, string> = {
  write: 'Writes', read: 'Reads', list: 'Lists', get: 'Gets', fetch: 'Fetches',
  search: 'Searches', execute: 'Executes', call: 'Calls', invoke: 'Invokes',
  query: 'Queries', create: 'Creates', update: 'Updates', delete: 'Deletes',
  remove: 'Removes', run: 'Runs', send: 'Sends', process: 'Processes',
  handle: 'Handles', parse: 'Parses', load: 'Loads', save: 'Saves',
  generate: 'Generates', validate: 'Validates', format: 'Formats',
  transform: 'Transforms', convert: 'Converts', check: 'Checks',
  filter: 'Filters', find: 'Finds',
};

const KNOWN_ACRONYMS = new Set([
  'html', 'css', 'json', 'xml', 'api', 'url', 'http', 'https',
  'sql', 'db', 'id', 'ui', 'io', 'pdf', 'csv', 'svg', 'jwt',
  'sdk', 'cli', 'tts', 'llm', 'rag',
]);

function describeFromSnakeCase(name: string): string {
  const parts = name.split('_').filter(Boolean);
  if (parts.length === 0) return name;
  return parts
    .map((p, i) => {
      const lower = p.toLowerCase();
      if (KNOWN_ACRONYMS.has(lower)) return lower.toUpperCase();
      if (i === 0) return VERB_FORMS[lower] ?? (p.charAt(0).toUpperCase() + p.slice(1));
      return p;
    })
    .join(' ');
}

// ── AGENTS.md builder ─────────────────────────────────────────────────────────

function buildAgentsMd(
  graph: KnowledgeGraph,
  projectName: string,
  base: BaseData,
): string {
  const { cleanNodes, cleanDeps, degreeMap } = base;

  // Agent type inference
  let agentType: 'orchestrator' | 'worker' | 'tool-only' = 'tool-only';
  for (const n of cleanNodes) {
    if (n.label !== 'Function' && n.label !== 'Method') continue;
    const name = (n.properties.name ?? '').toLowerCase();
    if (ORCHESTRATOR_PATTERNS.some((p) => name.includes(p))) { agentType = 'orchestrator'; break; }
    if (WORKER_PATTERNS.some((p) => name.includes(p))) agentType = 'worker';
  }

  // Default model from deps
  const allPkgs = new Set(Object.values(cleanDeps).flat().map((p) => p.toLowerCase()));
  let defaultModel = 'claude-sonnet-4-6';
  if (allPkgs.has('openai') || allPkgs.has('@openai/openai')) defaultModel = 'gpt-4o';
  else if (allPkgs.has('google-generativeai') || allPkgs.has('google-genai')) defaultModel = 'gemini-2.0-flash';
  else if (allPkgs.has('groq')) defaultModel = 'llama-3.3-70b-versatile';

  // System prompt file
  const systemPromptNode = cleanNodes.find((n) => {
    const path = (n.properties.filePath ?? n.properties.name ?? '').toLowerCase();
    return path.includes('system_prompt') || path.endsWith('system.md') || path.includes('prompt.txt');
  });
  const systemPromptPath = systemPromptNode?.properties.filePath as string | undefined ?? '(not detected)';

  // Tool nodes
  const tools = cleanNodes
    .filter(
      (n) =>
        (n.label === 'Function' || n.label === 'Method' || n.label === 'Tool') &&
        TOOL_PREFIXES.some((p) => (n.properties.name ?? '').toLowerCase().startsWith(p)),
    )
    .map((n) => ({ node: n, degree: degreeMap.get(n.id) ?? 0 }))
    .sort((a, b) => b.degree - a.degree)
    .slice(0, 10);

  // Subagent nodes
  const SUBAGENT_PATTERNS = ['subagent', 'sub_agent', 'worker_agent', 'child_agent'];
  const subagentNodes = cleanNodes
    .filter((n) => {
      const name = (n.properties.name ?? '').toLowerCase();
      const path = (n.properties.filePath ?? '').toLowerCase();
      return SUBAGENT_PATTERNS.some((p) => name.includes(p) || path.includes(p));
    })
    .slice(0, 5);

  // Permission signals
  const hasWriteOps = cleanNodes.some((n) => {
    const name = (n.properties.name ?? '').toLowerCase();
    return name.includes('write_') || name.includes('delete_') || name.includes('remove_') || name.includes('update_');
  });
  const hasExternalCalls = [...allPkgs].some((p) =>
    ['requests', 'httpx', 'axios', 'aiohttp', 'node-fetch', 'got'].includes(p),
  );

  const knownFailures = [
    hasExternalCalls ? '  - External API unavailability or rate limiting' : '',
    hasWriteOps ? '  - Partial write failures leaving inconsistent state' : '',
    '  - Malformed input causing silent incorrect output',
  ].filter(Boolean);

  const lines: string[] = [
    '<!-- graphmycode:generated-start -->',
    `# ${projectName} — Agent Specification`,
    '',
    '## Agent Card',
    `- **Type**: ${agentType}`,
    `- **Default model**: ${defaultModel}`,
    `- **System prompt**: \`${systemPromptPath}\``,
    // Trigger / Input / Output omitted — cannot be inferred reliably from the AST
    '- **Known failure modes**:',
    ...knownFailures,
  ];

  if (tools.length > 0) {
    lines.push('', '## Tools');
    for (const { node } of tools) {
      const name = (node.properties.name ?? node.id) as string;
      const file = (node.properties.filePath ?? '').split('/').pop() ?? '';
      const desc = describeFromSnakeCase(name);
      lines.push(`- \`${name}(...)\` — ${desc}; defined in \`${file}\``);
    }
  }

  if (subagentNodes.length > 0) {
    lines.push('', '## Subagents');
    for (const n of subagentNodes) {
      const name = (n.properties.name ?? n.id) as string;
      const file = (n.properties.filePath ?? '').split('/').pop() ?? '';
      lines.push(`- \`${name}\`${file ? ` — \`${file}\`` : ''}`);
    }
  }

  const requiresConfirmation = [
    hasWriteOps ? 'file writes, deletes' : '',
    hasExternalCalls ? 'external API calls' : '',
    'dependency installs, destructive commands',
  ].filter(Boolean).join(', ');

  lines.push(
    '',
    '## Permissions',
    '- Auto-allowed: read, search, single-file inspection',
    `- Requires confirmation: ${requiresConfirmation}`,
    '',
    '<!-- graphmycode:generated-end -->',
  );

  return lines.join('\n');
}

// ── Public API ───────────────────────────────────────────────────────────────

export function exportAgentContext(
  graph: KnowledgeGraph,
  projectName: string,
  externalDeps: Record<string, string[]>,
  isAgent = false,
): void {
  const base = buildBase(graph, externalDeps);
  triggerDownload(buildClaudeMd(graph, projectName, base), 'CLAUDE.md');
  if (isAgent) {
    // Delay second download 100 ms so the browser doesn't suppress it
    const agentsMdContent = buildAgentsMd(graph, projectName, base);
    setTimeout(() => triggerDownload(agentsMdContent, 'AGENTS.md'), 100);
  }
}

/** @deprecated use exportAgentContext */
export function buildAgentContext(
  graph: KnowledgeGraph,
  projectName: string,
  externalDeps: Record<string, string[]>,
  isAgent = false,
): string {
  const base = buildBase(graph, externalDeps);
  void isAgent;
  return buildClaudeMd(graph, projectName, base);
}
