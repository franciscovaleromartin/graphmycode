import { useState, useRef, useCallback, useEffect } from 'react';
import * as Comlink from 'comlink';
import { useAppState } from '../hooks/useAppState';
import { useT } from '../lib/i18n';
import { extractZip } from '../services/zip';
import { createKnowledgeGraph } from '../core/graph/graph';
import type { IngestionWorkerApi } from '../workers/ingestion.worker';
import type { PipelineProgress } from '../types/pipeline';

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

// ── Worker singleton ──────────────────────────────────────────────────────────

let workerInstance: Worker | null = null;
let workerApi: Comlink.Remote<IngestionWorkerApi> | null = null;

function getWorkerApi(): Comlink.Remote<IngestionWorkerApi> {
  if (!workerApi) {
    workerInstance = new Worker(
      new URL('../workers/ingestion.worker.ts', import.meta.url),
      { type: 'module' },
    );
    workerApi = Comlink.wrap<IngestionWorkerApi>(workerInstance);
  }
  return workerApi;
}

// ── GraphAnimation ────────────────────────────────────────────────────────────

const HEAT_STOPS = [
  [59, 130, 246],
  [34, 197, 94],
  [245, 158, 11],
  [239, 68, 68],
] as const;

function graphHeatColor(t: number, alpha = 1): string {
  const clamped = Math.max(0, Math.min(1, t));
  const seg = Math.min(Math.floor(clamped * 3), 2);
  const lo = HEAT_STOPS[seg];
  const hi = HEAT_STOPS[seg + 1];
  const r2 = clamped * 3 - seg;
  const r = Math.round(lo[0] + (hi[0] - lo[0]) * r2);
  const g = Math.round(lo[1] + (hi[1] - lo[1]) * r2);
  const b = Math.round(lo[2] + (hi[2] - lo[2]) * r2);
  return `rgba(${r},${g},${b},${alpha})`;
}

const GRAPH_LABELS = [
  'index.ts', 'utils.py', 'App.tsx', 'router.go',
  'main.rs', 'api.js', 'auth.ts', 'models.py', 'store.ts', 'helpers.rb',
];

interface AnimNode {
  x: number; y: number;
  vx: number; vy: number;
  r: number; heat: number;
  phase: number; speed: number;
}

interface AnimEdge { i: number; j: number; bidir: boolean; }

function buildAnimData(W: number, H: number): { nodes: AnimNode[]; edges: AnimEdge[] } {
  const nodes: AnimNode[] = Array.from({ length: 40 }, () => {
    const heat = Math.random();
    return {
      x: 60 + Math.random() * (W - 120),
      y: 20 + Math.random() * (H - 40),
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      r: 3 + heat * 5,
      heat,
      phase: Math.random() * Math.PI * 2,
      speed: 0.015 + Math.random() * 0.01,
    };
  });
  const edges: AnimEdge[] = [];
  nodes.forEach((a, i) => {
    nodes.forEach((b, j) => {
      if (j <= i) return;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < 160 && Math.random() < 0.28) {
        edges.push({ i, j, bidir: a.heat > 0.55 && b.heat > 0.55 && Math.random() < 0.4 });
      }
    });
  });
  return { nodes, edges };
}

const GraphAnimation = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const dataRef = useRef<{ nodes: AnimNode[]; edges: AnimEdge[] } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    dataRef.current = buildAnimData(W, H);

    function draw() {
      if (!canvas || !ctx || !dataRef.current) return;
      const { nodes, edges } = dataRef.current;

      ctx.clearRect(0, 0, W, H);
      const bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, '#080d18');
      bg.addColorStop(1, '#050a0f');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      nodes.forEach(n => {
        n.phase += n.speed;
        n.x += n.vx; n.y += n.vy;
        if (n.x < 20 || n.x > W - 20) n.vx *= -1;
        if (n.y < 10 || n.y > H - 10) n.vy *= -1;
      });

      edges.forEach(({ i, j, bidir }) => {
        const a = nodes[i], b = nodes[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > 180) return;
        const fade = 1 - d / 180;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = bidir
          ? `rgba(249,115,22,${fade * 0.7})`
          : `rgba(30,41,59,${fade * 2})`;
        ctx.lineWidth = bidir ? 1.8 : 1;
        ctx.stroke();
      });

      nodes.forEach((n, idx) => {
        const pulse = 1 + Math.sin(n.phase) * 0.12;
        const r = n.r * pulse;
        if (n.heat > 0.6) {
          const grd = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r + 8);
          grd.addColorStop(0, graphHeatColor(n.heat, 0.15));
          grd.addColorStop(1, 'transparent');
          ctx.beginPath();
          ctx.arc(n.x, n.y, r + 8, 0, Math.PI * 2);
          ctx.fillStyle = grd;
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle = graphHeatColor(n.heat, 0.88);
        ctx.fill();
        if (n.heat > 0.68) {
          ctx.font = '9px monospace';
          ctx.fillStyle = 'rgba(100,116,139,0.55)';
          ctx.fillText(GRAPH_LABELS[idx % GRAPH_LABELS.length], n.x + r + 4, n.y + 3);
        }
      });

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div style={{ position: 'relative', height: '150px', overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        width={1120}
        height={300}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '70px',
        background: 'linear-gradient(to bottom, transparent, #0c111d)',
        pointerEvents: 'none',
      }} />
    </div>
  );
};

// ── LandingCards ──────────────────────────────────────────────────────────────

const LandingCards = () => {
  const t = useT();

  const views = [
    { icon: '🕸️', name: t.cardsStructuralName, bullets: t.cardsStructuralBullets },
    { icon: '🧠', name: t.cardsSemanticName,   bullets: t.cardsSemanticBullets },
    { icon: '🏙️', name: t.cardsDebtName,       bullets: t.cardsDebtBullets },
    { icon: '🔥', name: t.cardsHeatmapName,    bullets: t.cardsHeatmapBullets },
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
          <span style={{
            display: 'inline-flex', alignItems: 'center',
            fontSize: '9px', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase',
            padding: '3px 9px', borderRadius: '6px', marginBottom: '10px',
            background: 'rgba(251,191,36,.08)', color: '#fbbf24',
            border: '1px solid rgba(251,191,36,.18)',
          }}>
            {t.cardsViewsTag}
          </span>
          <p style={{ fontSize: '15px', fontWeight: 600, color: '#f1f5f9', marginBottom: '4px', lineHeight: 1.35 }}>
            {t.cardsViewsTitle}
          </p>
          <p style={{ fontSize: '12px', color: '#475569', marginBottom: '16px', lineHeight: 1.5 }}>
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
                        fontSize: '10px', color: '#475569', lineHeight: 1.4,
                        paddingLeft: '10px', position: 'relative',
                      }}>
                        <span style={{ position: 'absolute', left: 0, color: '#334155' }}>-</span>
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

      {/* ── Pair row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>

        {/* Privacy */}
        <div style={{
          borderRadius: '14px', border: '1px solid #1e293b',
          background: '#0c111d', padding: '18px 20px', position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: '-30px', right: '-30px',
            width: '100px', height: '100px', borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(45,212,191,.12) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />
          <div style={{
            width: '32px', height: '32px', borderRadius: '9px', display: 'flex',
            alignItems: 'center', justifyContent: 'center', fontSize: '14px', marginBottom: '12px',
            background: 'rgba(45,212,191,.1)', border: '1px solid rgba(45,212,191,.2)',
          }}>🔒</div>
          <span style={{
            display: 'inline-flex', fontSize: '9px', fontWeight: 700, letterSpacing: '.1em',
            textTransform: 'uppercase', padding: '3px 9px', borderRadius: '6px', marginBottom: '8px',
            background: 'rgba(20,184,166,.08)', color: '#2dd4bf',
            border: '1px solid rgba(45,212,191,.18)',
          }}>
            {t.cardsPrivacyTag}
          </span>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9', marginBottom: '6px', lineHeight: 1.35, whiteSpace: 'pre-line' }}>
            {t.cardsPrivacyTitle}
          </p>
          <p style={{ fontSize: '11px', color: '#475569', lineHeight: 1.6 }}>
            {t.cardsPrivacyBody}
          </p>
        </div>

        {/* AI */}
        <div style={{
          borderRadius: '14px', border: '1px solid #1e293b',
          background: '#0c111d', padding: '18px 20px', position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: '-30px', right: '-30px',
            width: '100px', height: '100px', borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(167,139,250,.14) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />
          <div style={{
            width: '32px', height: '32px', borderRadius: '9px', display: 'flex',
            alignItems: 'center', justifyContent: 'center', fontSize: '14px', marginBottom: '12px',
            background: 'rgba(167,139,250,.1)', border: '1px solid rgba(167,139,250,.2)',
          }}>✦</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
            <span style={{
              display: 'inline-flex', fontSize: '9px', fontWeight: 700, letterSpacing: '.1em',
              textTransform: 'uppercase', padding: '3px 9px', borderRadius: '6px',
              background: 'rgba(167,139,250,.08)', color: '#c4b5fd',
              border: '1px solid rgba(196,181,253,.18)',
            }}>
              {t.cardsAiTag}
            </span>
            <span style={{
              fontSize: '9px', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase',
              background: 'rgba(255,255,255,.05)', color: '#475569',
              borderRadius: '5px', padding: '3px 7px', border: '1px solid rgba(255,255,255,.07)',
            }}>
              {t.cardsAiOptional}
            </span>
          </div>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9', marginBottom: '6px', lineHeight: 1.35 }}>
            {t.cardsAiTitle}
          </p>
          <p style={{ fontSize: '11px', color: '#475569', lineHeight: 1.6 }}>
            {t.cardsAiBody}
          </p>
        </div>

      </div>
    </div>
  );
};

// ── Component ─────────────────────────────────────────────────────────────────

type InputMode = 'zip' | 'github';

export const LandingScreen = () => {
  const { setGraph, setViewMode, setProgress, setProjectName, setExternalDeps } = useAppState();
  const t = useT();

  const [mode, setMode] = useState<InputMode>('zip');
  const [githubUrl, setGithubUrl] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pre-calentar el worker y los WASM de lenguaje al montar el componente.
  // Objetivo: que el chunk JS del worker y todos los archivos WASM queden en
  // caché del navegador antes de que el usuario pueda desconectarse de internet.
  // Los WASM de lenguaje se descargan en segundo plano durante el tiempo de
  // inactividad del navegador para no interferir con la carga inicial.
  useEffect(() => {
    const api = getWorkerApi();
    api.preWarm().catch(() => {/* no fatal */});

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

    const prefetch = () =>
      languageWasms.forEach(url => fetch(url).catch(() => {}));

    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(prefetch, { timeout: 10_000 });
    } else {
      setTimeout(prefetch, 3_000);
    }
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
    [setGraph, setViewMode, setProgress, setProjectName, setExternalDeps],
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-void px-6">
      {/* Ambient glows */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-accent/8 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 h-64 w-64 rounded-full bg-node-function/6 blur-3xl" />
      </div>

      <div className="relative w-full max-w-xl">
        {/* Header */}
        <div className="mb-10 text-center">
          <h1 className="mb-1 text-4xl font-semibold tracking-tight text-text-primary">
            <span className="text-fuchsia-400">Graph</span>My<span className="text-cyan-400">Code</span><span className="text-sm font-normal text-text-secondary">.com</span>
          </h1>
          <p className="mb-2 text-xs text-text-muted">{t.by}</p>
          <p className="text-sm text-text-secondary">{t.tagline}</p>
        </div>

        {/* Tab switcher */}
        <div className="mb-4 flex rounded-xl border border-border-subtle bg-surface p-1">
          {(['zip', 'github'] as InputMode[]).map((tab) => (
            <button
              key={tab}
              onClick={() => { setMode(tab); setError(null); }}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                mode === tab
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
            className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed py-14 transition-all ${
              isDragging
                ? 'border-accent bg-accent/8 scale-[1.01]'
                : 'border-border-default bg-surface hover:border-accent/50 hover:bg-elevated'
            }`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <svg
              className={`mb-4 h-10 w-10 transition-colors ${isDragging ? 'text-accent' : 'text-text-muted'}`}
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

        {/* Privacy badge */}
        <p className="mt-6 text-center text-xs text-text-muted">
          <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-node-function align-middle" />
          {t.privacy}
        </p>
      </div>
    </div>
  );
};
