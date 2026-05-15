// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

import type { GraphNode } from './types';
import {
  FRAMEWORK_PACKAGES, PYTHON_BACKEND_FW, JS_FRONTEND_FW, JS_SERVER_FW,
} from './types';

export function detectStack(cleanNodes: GraphNode[], cleanDeps: Record<string, string[]>) {
  const langCounts = new Map<string, number>();
  const fileNames = new Set<string>();

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

  const primaryLang = [...langCounts.entries()].reduce<[string, number]>(
    (max, cur) => cur[1] > max[1] ? cur : max, ['', 0]
  )[0];

  const allPkgs = new Set(Object.values(cleanDeps).flat().map((p) => p.toLowerCase()));

  const frameworks: string[] = [];
  for (const [pkg, name] of Object.entries(FRAMEWORK_PACKAGES)) {
    if (allPkgs.has(pkg.toLowerCase())) frameworks.push(name);
  }

  const pyBackend = frameworks.filter((f) => PYTHON_BACKEND_FW.has(f));
  const jsFrontend = frameworks.filter((f) => JS_FRONTEND_FW.has(f));
  const jsServer = frameworks.filter((f) => JS_SERVER_FW.has(f));
  const isFullstack = pyBackend.length > 0 && (jsFrontend.length > 0 || jsServer.length > 0);

  let pyPkgManager = '';
  if (fileNames.has('pyproject.toml')) pyPkgManager = 'pyproject';
  else if (fileNames.has('setup.py') || fileNames.has('setup.cfg')) pyPkgManager = 'pip';
  else if (fileNames.has('requirements.txt')) pyPkgManager = 'pip';

  let jsPkgManager = '';
  if (fileNames.has('pnpm-lock.yaml') || fileNames.has('pnpm-lock.yml')) jsPkgManager = 'pnpm';
  else if (fileNames.has('yarn.lock')) jsPkgManager = 'yarn';
  else if (fileNames.has('bun.lockb') || fileNames.has('bun.lock')) jsPkgManager = 'bun';
  else if (fileNames.has('package.json')) jsPkgManager = 'npm';

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
    const hasWsgiFiles = fileNames.has('wsgi.py') || fileNames.has('asgi.py');
    runtime = (hasWsgiFiles || pyBackend.length > 0) ? 'server' : 'CLI';
  } else if (['go', 'rust'].includes(primaryLang)) {
    runtime = 'server';
  } else if (allPkgs.has('aws-lambda-powertools') || allPkgs.has('@aws-sdk/client-lambda')) {
    runtime = 'lambda';
  } else {
    runtime = '';
  }

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

export function inferCommands(
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
