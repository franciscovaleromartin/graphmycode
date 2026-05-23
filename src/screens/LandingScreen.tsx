// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

import { useState, useRef, useCallback, useEffect } from 'react';
import * as Comlink from 'comlink';
import { useAppState } from '../hooks/useAppState';
import { useT, detectLang } from '../lib/i18n';
import { extractZip } from '../services/zip';
import { createKnowledgeGraph } from '../core/graph/graph';
import { getWorkerApi } from '../services/ingestion-worker';
import type { PipelineProgress } from '../types/pipeline';
import { GraphAnimation } from '../components/landing/GraphAnimation';
import { TopBar } from '../components/landing/TopBar';

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseGitHubUrl(input: string): { owner: string; repo: string } | null {
  const clean = input.trim().replace(/\.git$/, '');
  const match = clean.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+)\/([^/\s?#]+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.java', '.go', '.rs', '.rb', '.php',
  '.cs', '.cpp', '.c', '.h', '.swift', '.kt',
]);

function isSourceFile(path: string): boolean {
  const dot = path.lastIndexOf('.');
  if (dot === -1) return false;
  return SOURCE_EXTENSIONS.has(path.slice(dot).toLowerCase());
}

async function fetchGitHubFiles(
  owner: string,
  repo: string,
  onStatus: (msg: string) => void,
) {
  onStatus('Obteniendo árbol de archivos...');
  const treeRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`,
  );
  if (!treeRes.ok) {
    const err = await treeRes.json().catch(() => ({}));
    throw new Error(err.message ?? `GitHub API error ${treeRes.status}`);
  }
  const treeData = await treeRes.json();
  const sourceFiles: { path: string; url: string }[] = (treeData.tree ?? [])
    .filter((f: any) => f.type === 'blob' && isSourceFile(f.path) && f.size < 200_000)
    .slice(0, 250)
    .map((f: any) => ({
      path: f.path,
      url: `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${f.path}`,
    }));

  if (sourceFiles.length === 0) throw new Error('No se encontraron archivos de código fuente');

  onStatus(`Descargando ${sourceFiles.length} archivos...`);
  const entries = await Promise.all(
    sourceFiles.map(async ({ path, url }) => {
      const res = await fetch(url);
      if (!res.ok) return null;
      const content = await res.text();
      return { path, content };
    }),
  );
  return entries.filter(Boolean) as { path: string; content: string }[];
}


// ── LandingCards ──────────────────────────────────────────────────────────────

const GLOW_BASE: React.CSSProperties = {
  position: 'absolute', top: '-30px', right: '-30px',
  borderRadius: '50%', pointerEvents: 'none',
};

const CARD_STYLE: React.CSSProperties = {
  borderRadius: '14px', border: '1px solid #1e293b',
  background: '#0c111d', padding: '18px 20px', position: 'relative', overflow: 'hidden',
};

const ICON_BOX_BASE: React.CSSProperties = {
  width: '32px', height: '32px', borderRadius: '9px', display: 'flex',
  alignItems: 'center', justifyContent: 'center', fontSize: '14px', marginBottom: '12px',
};

const TAG_BASE: React.CSSProperties = {
  display: 'inline-flex', fontSize: '9px', fontWeight: 700, letterSpacing: '.1em',
  textTransform: 'uppercase', padding: '3px 9px', borderRadius: '6px', marginBottom: '8px',
};

const LandingCards = () => {
  const t = useT();

  const views = [
    { icon: '🕸️', name: t.cardsStructuralName, bullets: t.cardsStructuralBullets },
    { icon: '🧠', name: t.cardsSemanticName, bullets: t.cardsSemanticBullets },
    { icon: '🏙️', name: t.cardsDebtName, bullets: t.cardsDebtBullets },
    { icon: '🔥', name: t.cardsHeatmapName, bullets: t.cardsHeatmapBullets },
    { icon: '🔀', name: t.cardsCodeFlowName, bullets: t.cardsCodeFlowBullets },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>

      {/* ── Featured card ── */}
      <div style={{
        borderRadius: '16px', border: '1px solid #1e293b',
        background: '#0c111d', overflow: 'hidden',
      }}>
        <GraphAnimation />
        <div style={{ padding: '4px 22px 22px' }}>
          <span style={{ ...TAG_BASE, alignItems: 'center', marginBottom: '10px', background: 'rgba(251,191,36,.08)', color: '#fbbf24', border: '1px solid rgba(251,191,36,.18)' }}>
            {t.cardsViewsTag}
          </span>
          <p style={{ fontSize: '15px', fontWeight: 600, color: '#f1f5f9', marginBottom: '4px', lineHeight: 1.35 }}>
            {t.cardsViewsTitle}
          </p>
          <p style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '16px', lineHeight: 1.5 }}>
            {t.cardsViewsSub}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {views.map(view => (
              <div key={view.name} style={{
                display: 'flex', alignItems: 'flex-start', gap: '9px',
                padding: '11px 13px', borderRadius: '11px',
                background: 'rgba(255,255,255,.025)',
                border: '1px solid rgba(255,255,255,.055)',
              }}>
                <span style={{ fontSize: '15px', flexShrink: 0, marginTop: '1px' }}>{view.icon}</span>
                <div>
                  <p style={{ fontSize: '11px', fontWeight: 600, color: '#e2e8f0', marginBottom: '5px', lineHeight: 1.2 }}>
                    {view.name}
                  </p>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {view.bullets.map((b: string) => (
                      <li key={b} style={{
                        fontSize: '10px', color: '#94a3b8', lineHeight: 1.4,
                        paddingLeft: '10px', position: 'relative',
                      }}>
                        <span style={{ position: 'absolute', left: 0, color: '#94a3b8' }}>-</span>
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Export / Agent Mode card ── */}
      <div style={CARD_STYLE}>
        <div style={{ ...GLOW_BASE, width: '110px', height: '110px', background: 'radial-gradient(circle, rgba(245,158,11,.13) 0%, transparent 70%)' }} />
        <div style={{ ...ICON_BOX_BASE, background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.2)' }}>⬇</div>
        <span style={{ ...TAG_BASE, background: 'rgba(245,158,11,.08)', color: '#f59e0b', border: '1px solid rgba(245,158,11,.18)' }}>
          {t.cardsExportTag}
        </span>
        <p style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9', marginBottom: '6px', lineHeight: 1.35 }}>
          {t.cardsExportTitle}
        </p>
        <p style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.6, marginBottom: '10px' }}>
          {t.cardsExportBody}
        </p>
        <p style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.6 }}>
          {t.cardsExportBenefit}
        </p>
      </div>

      {/* ── Pair row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>

        {/* Privacy */}
        <div style={CARD_STYLE}>
          <div style={{ ...GLOW_BASE, width: '100px', height: '100px', background: 'radial-gradient(circle, rgba(45,212,191,.12) 0%, transparent 70%)' }} />
          <div style={{ ...ICON_BOX_BASE, background: 'rgba(45,212,191,.1)', border: '1px solid rgba(45,212,191,.2)' }}>🔒</div>
          <span style={{ ...TAG_BASE, background: 'rgba(20,184,166,.08)', color: '#2dd4bf', border: '1px solid rgba(45,212,191,.18)' }}>
            {t.cardsPrivacyTag}
          </span>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9', marginBottom: '6px', lineHeight: 1.35, whiteSpace: 'pre-line' }}>
            {t.cardsPrivacyTitle}
          </p>
          <p style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.6 }}>
            {t.cardsPrivacyBody}
          </p>
        </div>

        {/* AI */}
        <div style={CARD_STYLE}>
          <div style={{ ...GLOW_BASE, width: '100px', height: '100px', background: 'radial-gradient(circle, rgba(167,139,250,.14) 0%, transparent 70%)' }} />
          <div style={{ ...ICON_BOX_BASE, background: 'rgba(167,139,250,.1)', border: '1px solid rgba(167,139,250,.2)' }}>✦</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
            <span style={{ ...TAG_BASE, marginBottom: 0, background: 'rgba(167,139,250,.08)', color: '#c4b5fd', border: '1px solid rgba(196,181,253,.18)' }}>
              {t.cardsAiTag}
            </span>
            <span style={{ ...TAG_BASE, marginBottom: 0, letterSpacing: '.08em', background: 'rgba(255,255,255,.05)', color: '#94a3b8', borderRadius: '5px', padding: '3px 7px', border: '1px solid rgba(255,255,255,.07)' }}>
              {t.cardsAiOptional}
            </span>
          </div>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9', marginBottom: '6px', lineHeight: 1.35 }}>
            {t.cardsAiTitle}
          </p>
          <p style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.6 }}>
            {t.cardsAiBody}
          </p>
          <p style={AI_WARNING_STYLE}>
            {t.cardsAiWarning}
          </p>
        </div>

      </div>

      {/* ── Cypher card ── */}
      <div style={CARD_STYLE}>
        <div style={{ ...GLOW_BASE, width: '110px', height: '110px', background: 'radial-gradient(circle, rgba(52,211,153,.13) 0%, transparent 70%)' }} />
        <div style={{ ...ICON_BOX_BASE, background: 'rgba(52,211,153,.1)', border: '1px solid rgba(52,211,153,.2)' }}>🔍</div>
        <span style={{ ...TAG_BASE, background: 'rgba(52,211,153,.08)', color: '#34d399', border: '1px solid rgba(52,211,153,.2)' }}>
          {t.cardsCypherTag}
        </span>
        <p style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9', marginBottom: '6px', lineHeight: 1.35 }}>
          {t.cardsCypherTitle}
        </p>
        <p style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.6, marginBottom: '10px' }}>
          {t.cardsCypherBody}
        </p>
        <code style={CYPHER_CODE_STYLE}>
          {t.cardsCypherExample}
        </code>
      </div>

    </div>
  );
};

// ── Remaining internal styles ─────────────────────────────────────────────────

const AI_WARNING_STYLE: React.CSSProperties = {
  marginTop: '10px', fontSize: '10px', lineHeight: 1.5,
  color: '#f59e0b', background: 'rgba(245,158,11,.08)',
  border: '1px solid rgba(245,158,11,.2)', borderRadius: '7px', padding: '6px 9px',
};

const CYPHER_CODE_STYLE: React.CSSProperties = {
  display: 'block', fontSize: '10px', color: '#34d399',
  background: 'rgba(52,211,153,.06)', border: '1px solid rgba(52,211,153,.15)',
  borderRadius: '7px', padding: '7px 10px', fontFamily: 'monospace',
  letterSpacing: '0.01em',
};

// ── AuthorSection ─────────────────────────────────────────────────────────────

const AuthorSection = () => {
  const t = useT();
  return (
    <div style={{
      borderRadius: '14px', border: '1px solid #1e293b',
      background: '#0c111d', padding: '18px 20px', marginTop: '10px',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '80px', height: '80px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(56,189,248,.1) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <p style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#64748b', marginBottom: '10px' }}>
        {t.authorTitle}
      </p>
      <p style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9', marginBottom: '8px' }}>
        {t.authorName}
      </p>
      <p style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.65, marginBottom: '12px' }}>
        {t.authorBio}{' '}
        <a href="https://convertertomarkdown.com" target="_blank" rel="noopener noreferrer" style={{ color: '#38bdf8', textDecoration: 'none' }}>
          {t.authorOtherProject}
        </a>.
      </p>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <a href="https://www.linkedin.com/in/francisco-valero/" target="_blank" rel="noopener noreferrer"
          style={{ fontSize: '11px', color: '#64748b', textDecoration: 'none', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)', padding: '3px 10px', borderRadius: '6px' }}>
          LinkedIn
        </a>
      </div>
    </div>
  );
};

// ── LandingFooter ─────────────────────────────────────────────────────────────

const GitHubMark = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
  </svg>
);

const Dot = () => <span className="text-border-subtle select-none">·</span>;

const LandingFooter = () => (
  <footer className="w-full border-t border-white/[0.06] mt-12 py-8 px-6">
    <div className="flex flex-col items-center gap-3">
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-xs text-text-muted">
        <a href="/como-funciona" className="hover:text-text-secondary transition-colors">Cómo funciona</a>
        <Dot />
        <a href="/casos-de-uso" className="hover:text-text-secondary transition-colors">Casos de uso</a>
        <Dot />
        <a href="/privacy" className="hover:text-text-secondary transition-colors">Política de privacidad</a>
        <Dot />
        <a
          href="https://github.com/franciscovaleromartin/graphmycode"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 hover:text-text-secondary transition-colors"
        >
          <GitHubMark />
          GitHub
        </a>
        <Dot />
        <a
          href="https://polyformproject.org/licenses/noncommercial/1.0.0"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-text-secondary transition-colors"
        >
          Licencia PolyForm
        </a>
      </div>
      <p className="text-[11px] text-text-muted/50">© 2026 Francisco Valero</p>
    </div>
  </footer>
);

// ── Component ─────────────────────────────────────────────────────────────────

type InputMode = 'zip' | 'github';

export const LandingScreen = () => {
  const { setGraph, setViewMode, setProgress, setProjectName, setExternalDeps, setGraphViewType } = useAppState();
  const t = useT();

  const [mode, setMode] = useState<InputMode>('zip');
  const [githubUrl, setGithubUrl] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Carga automática desde el CLI: #localserver=URL (v1.0.5+) o #localzip=BASE64 (legacy)
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1))
    const localserver = hash.get('localserver')
    const localzip = hash.get('localzip')
    const project = hash.get('project') ?? 'local-project'
    if (!localserver && !localzip) return

    window.history.replaceState({}, '', window.location.pathname)

    ;(async () => {
      try {
        setError(null)
        setIsProcessing(true)
        setViewMode('loading')
        setProgress({ phase: 'extracting', percent: 5, message: 'Cargando proyecto local...' })

        let file: File
        if (localserver) {
          const res = await fetch(localserver)
          if (!res.ok) throw new Error(`El servidor local respondió ${res.status}`)
          const blob = await res.blob()
          file = new File([blob], `${project}.zip`, { type: 'application/zip' })
        } else {
          const b64 = localzip!.replace(/-/g, '+').replace(/_/g, '/')
          const binary = atob(b64)
          const bytes = new Uint8Array(binary.length)
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
          const blob = new Blob([bytes], { type: 'application/zip' })
          file = new File([blob], `${project}.zip`, { type: 'application/zip' })
        }

        const entries = await extractZip(file)
        if (entries.length === 0) throw new Error('El zip no contiene archivos de código fuente')

        await runPipeline(entries, project)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar el proyecto local')
        setIsProcessing(false)
        setViewMode('onboarding')
      }
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-calentar el worker y los WASM de lenguaje durante el tiempo de
  // inactividad del navegador, para que estén en caché antes de que el usuario
  // pueda desconectarse de internet, sin interferir con la carga inicial.
  useEffect(() => {
    const languageWasms = [
      '/wasm/typescript/tree-sitter-typescript.wasm',
      '/wasm/typescript/tree-sitter-tsx.wasm',
      '/wasm/javascript/tree-sitter-javascript.wasm',
      '/wasm/python/tree-sitter-python.wasm',
      '/wasm/java/tree-sitter-java.wasm',
      '/wasm/go/tree-sitter-go.wasm',
      '/wasm/rust/tree-sitter-rust.wasm',
      '/wasm/c/tree-sitter-c.wasm',
      '/wasm/cpp/tree-sitter-cpp.wasm',
      '/wasm/csharp/tree-sitter-csharp.wasm',
      '/wasm/ruby/tree-sitter-ruby.wasm',
      '/wasm/php/tree-sitter-php.wasm',
    ];

    const warmUp = () => {
      getWorkerApi().preWarm().catch(() => { });
      languageWasms.forEach(url => fetch(url).catch(() => { }));
    };

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let idleId: number | undefined;
    if ('requestIdleCallback' in window) {
      idleId = (window as any).requestIdleCallback(warmUp, { timeout: 10_000 });
    } else {
      timeoutId = setTimeout(warmUp, 3_000);
    }
    return () => {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      if (idleId !== undefined) (window as any).cancelIdleCallback?.(idleId);
    };
  }, []);

  const runPipeline = useCallback(
    async (files: { path: string; content: string }[], projectName: string) => {
      setError(null);
      setIsProcessing(true);
      setProjectName(projectName);
      setViewMode('loading');

      const onProgress = Comlink.proxy((p: PipelineProgress) => setProgress(p));

      try {
        const api = getWorkerApi();
        const result = await api.runPipelineFromFiles(files, onProgress);

        const graph = createKnowledgeGraph();
        result.nodes.forEach((n) => graph.addNode(n));
        result.relationships.forEach((r) => graph.addRelationship(r));

        setGraph(graph);
        setExternalDeps(result.externalDeps ?? {});
        setProgress(null);
        setGraphViewType('structural');
        setViewMode('exploring');
      } catch (err) {
        const msg = err instanceof Error ? err.message : t.errDownload;
        setError(msg);
        setProgress(null);
        setViewMode('onboarding');
      } finally {
        setIsProcessing(false);
      }
    },
    [setGraph, setViewMode, setProgress, setProjectName, setExternalDeps, setGraphViewType],
  );

  const handleFiles = useCallback(
    async (fileList: FileList) => {
      const file = fileList[0];
      if (!file?.name.endsWith('.zip')) {
        setError(t.errNotZip);
        return;
      }
      const entries = await extractZip(file);
      if (entries.length === 0) {
        setError(t.errEmptyZip);
        return;
      }
      await runPipeline(entries, file.name.replace(/\.zip$/i, ''));
    },
    [runPipeline],
  );

  const handleGitHub = useCallback(async () => {
    const parsed = parseGitHubUrl(githubUrl);
    if (!parsed) {
      setError(t.errInvalidUrl);
      return;
    }
    try {
      setIsProcessing(true);
      setError(null);
      let statusMsg = '';
      const entries = await fetchGitHubFiles(parsed.owner, parsed.repo, (msg) => {
        statusMsg = msg;
        setProgress({ phase: 'extracting', percent: 10, message: msg });
      });
      void statusMsg;
      await runPipeline(entries, `${parsed.owner}/${parsed.repo}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errDownload);
      setIsProcessing(false);
    }
  }, [githubUrl, runPipeline, setProgress]);

  // Drag & drop events
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length) await handleFiles(e.dataTransfer.files);
  };

  // Keyboard shortcut: Enter in GitHub input
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isProcessing) handleGitHub();
  };


  return (
    <div className="flex min-h-screen flex-col items-center bg-void px-6 pt-16">
      <TopBar />
      {/* Ambient glows */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 left-1/2 size-96 -translate-x-1/2 rounded-full bg-accent/8 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 size-64 rounded-full bg-node-function/6 blur-3xl" />
      </div>

      <div className="relative flex w-full max-w-xl flex-1 flex-col justify-center py-10">
        {/* Header */}
        <div className="mb-10 text-center">
          <h1 className="mb-1 text-4xl font-semibold tracking-tight text-text-primary">
            <span className="text-fuchsia-400">Graph</span>My<span className="text-cyan-400">Code</span><span className="text-sm font-normal text-text-secondary">.com</span>
          </h1>
          <p className="mb-2 text-xs text-text-muted">{t.by}</p>
          <p className="text-sm text-text-secondary">{t.tagline}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {['12 lenguajes', 'hasta 250 archivos', '0 servidores', '5 vistas'].map((label) => (
              <span key={label} className="rounded-full border border-border-subtle bg-surface px-3 py-1 text-xs text-text-muted">
                {label}
              </span>
            ))}
          </div>
          <div className="mt-4 overflow-hidden rounded-xl border border-border-subtle shadow-lg">
            <video
              src={detectLang() === 'en' ? '/anuncio_GraphMyCode_en.mp4' : '/anuncio_GraphMyCode.mp4'}
              controls
              playsInline
              preload="none"
              width="3840"
              height="2160"
              className="w-full"
            />
          </div>
        </div>

        {/* Tab switcher */}
        <div className="mb-4 flex rounded-xl border border-border-subtle bg-surface p-1">
          {(['zip', 'github'] as InputMode[]).map((tab) => (
            <button
              key={tab}
              onClick={() => { setMode(tab); setError(null); }}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${mode === tab
                  ? 'bg-accent/15 text-accent'
                  : 'text-text-muted hover:text-text-secondary'
                }`}
            >
              {tab === 'zip' ? t.tabZip : t.tabGithub}
            </button>
          ))}
        </div>

        {/* ZIP drop zone */}
        {mode === 'zip' && (
          <div
            role="button"
            tabIndex={0}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed py-14 transition-all ${isDragging
                ? 'border-accent bg-accent/8 scale-[1.01]'
                : 'border-border-default bg-surface hover:border-accent/50 hover:bg-elevated'
              }`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
          >
            <svg
              className={`mb-4 size-10 transition-colors ${isDragging ? 'text-accent' : 'text-text-muted'}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
              />
            </svg>
            <p className="mb-1 text-sm font-medium text-text-primary">{t.dropTitle}</p>
            <p className="text-xs text-text-muted">{t.dropSubtitle}</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
            />
          </div>
        )}

        {/* GitHub URL input */}
        {mode === 'github' && (
          <div className="rounded-2xl border border-border-default bg-surface p-6">
            <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-text-muted">
              {t.repoLabel}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={t.repoPlaceholder}
                disabled={isProcessing}
                className="flex-1 rounded-xl border border-border-default bg-elevated px-4 py-2.5 text-sm text-text-primary placeholder-text-muted outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent/30 disabled:opacity-50"
              />
              <button
                onClick={handleGitHub}
                disabled={isProcessing || !githubUrl.trim()}
                className="rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-void transition-all hover:bg-accent-dim disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t.analyzeBtn}
              </button>
            </div>
            <p className="mt-3 text-xs text-text-muted">{t.repoHint}</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/8 px-4 py-3 text-center text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Tarjetas informativas */}
        <LandingCards />

        {/* Tarjeta del creador */}
        <AuthorSection />

        {/* Privacy badge */}
        <p className="mt-6 text-center text-xs text-text-muted">
          <span className="mr-1.5 inline-block size-1.5 rounded-full bg-node-function align-middle" />
          {t.privacy}
        </p>
      </div>

      <LandingFooter />
    </div>
  );
};
