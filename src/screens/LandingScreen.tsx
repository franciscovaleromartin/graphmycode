// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

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
          <p style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.6 }}>
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
              background: 'rgba(255,255,255,.05)', color: '#94a3b8',
              borderRadius: '5px', padding: '3px 7px', border: '1px solid rgba(255,255,255,.07)',
            }}>
              {t.cardsAiOptional}
            </span>
          </div>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9', marginBottom: '6px', lineHeight: 1.35 }}>
            {t.cardsAiTitle}
          </p>
          <p style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.6 }}>
            {t.cardsAiBody}
          </p>
          <p style={{
            marginTop: '10px', fontSize: '10px', lineHeight: 1.5,
            color: '#f59e0b',
            background: 'rgba(245,158,11,.08)',
            border: '1px solid rgba(245,158,11,.2)',
            borderRadius: '7px', padding: '6px 9px',
          }}>
            {t.cardsAiWarning}
          </p>
        </div>

      </div>
    </div>
  );
};

// ── TopBar ────────────────────────────────────────────────────────────────────

function formatStars(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace('.0', '')}k` : String(n);
}

const TopBar = () => {
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    const load = () =>
      fetch('https://api.github.com/repos/franciscovaleromartin/graphmycode')
        .then(r => r.ok ? r.json() : null)
        .then(d => d?.stargazers_count != null && setStars(d.stargazers_count))
        .catch(() => {});

    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(load);
    } else {
      setTimeout(load, 5_000);
    }
  }, []);

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 24px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(8,13,24,0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      {/* Logo */}
      <span style={{ fontSize: '16px', fontWeight: 600, letterSpacing: '-0.02em', color: '#f1f5f9' }}>
        <span style={{ color: '#e879f9' }}>Graph</span>My<span style={{ color: '#22d3ee' }}>Code</span>
      </span>

      {/* Right side: LinkedIn + GitHub */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>

      {/* LinkedIn */}
      <a
        href="https://www.linkedin.com/in/francisco-valero/"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '32px', height: '32px', borderRadius: '8px',
          border: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(255,255,255,0.04)',
          color: '#94a3b8', textDecoration: 'none',
          transition: 'color 0.15s, background 0.15s',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLAnchorElement).style.color = '#0a66c2';
          (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(10,102,194,0.12)';
          (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(10,102,194,0.35)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLAnchorElement).style.color = '#94a3b8';
          (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,0.04)';
          (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(255,255,255,0.08)';
        }}
        aria-label="LinkedIn"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
        </svg>
      </a>

      {/* Web personal */}
      <a
        href="https://francisco-valero.com"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '32px', height: '32px', borderRadius: '8px',
          border: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(255,255,255,0.04)',
          color: '#94a3b8', textDecoration: 'none',
          transition: 'color 0.15s, background 0.15s, border-color 0.15s',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLAnchorElement).style.color = '#f1f5f9';
          (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,0.08)';
          (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(255,255,255,0.2)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLAnchorElement).style.color = '#94a3b8';
          (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,0.04)';
          (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(255,255,255,0.08)';
        }}
        aria-label="Web personal"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10"/>
          <line x1="2" y1="12" x2="22" y2="12"/>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>
      </a>

      {/* GitHub stars */}
      <a
        href="https://github.com/franciscovaleromartin/graphmycode"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'flex', alignItems: 'center', gap: '7px',
          padding: '5px 12px', borderRadius: '8px',
          border: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(255,255,255,0.04)',
          color: '#94a3b8', fontSize: '12px', fontWeight: 500,
          textDecoration: 'none', transition: 'color 0.15s, background 0.15s',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLAnchorElement).style.color = '#f1f5f9';
          (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,0.08)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLAnchorElement).style.color = '#94a3b8';
          (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,0.04)';
        }}
      >
        {/* GitHub mark */}
        <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
        </svg>
        {/* Star icon */}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
        <span>{stars !== null ? formatStars(stars) : '—'}</span>
      </a>

      </div>
    </div>
  );
};

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

  // Precalentar el worker y los WASM solo cuando el usuario muestra intención
  // de usar la herramienta (hover/focus sobre el panel de análisis).
  // Evita descargas pesadas en la ruta crítica del LCP.
  const preWarmedRef = useRef(false);
  const triggerPreWarm = useCallback(() => {
    if (preWarmedRef.current) return;
    preWarmedRef.current = true;

    const api = getWorkerApi();
    api.preWarm().catch(() => {});

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
    languageWasms.forEach(url => fetch(url).catch(() => {}));
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-void px-6 pt-16">
      <TopBar />
      {/* Ambient glows */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-accent/8 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 h-64 w-64 rounded-full bg-node-function/6 blur-3xl" />
      </div>

      <div className="relative w-full max-w-xl" onPointerEnter={triggerPreWarm} onFocus={triggerPreWarm}>
        {/* Header */}
        <div className="mb-10 text-center">
          <h1 className="mb-1 text-4xl font-semibold tracking-tight text-text-primary">
            <span className="text-fuchsia-400">Graph</span>My<span className="text-cyan-400">Code</span><span className="text-sm font-normal text-text-secondary">.com</span>
          </h1>
          <p className="mb-2 text-xs text-text-muted" aria-label={t.by}>{t.by}</p>
          <p className="text-sm text-text-secondary">{t.tagline}</p>
        </div>

        {/* Tab switcher */}
        <div role="tablist" aria-label="Modo de entrada" className="mb-4 flex rounded-xl border border-border-subtle bg-surface p-1">
          {(['zip', 'github'] as InputMode[]).map((tab) => (
            <button
              key={tab}
              role="tab"
              aria-selected={mode === tab}
              aria-controls={tab === 'zip' ? 'panel-zip' : 'panel-github'}
              id={tab === 'zip' ? 'tab-zip' : 'tab-github'}
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
            id="panel-zip"
            role="tabpanel"
            aria-labelledby="tab-zip"
          >
            <div
              role="button"
              tabIndex={0}
              aria-label={`${t.dropTitle}. ${t.dropSubtitle}`}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed py-14 transition-all ${
                isDragging
                  ? 'border-accent bg-accent/8 scale-[1.01]'
                  : 'border-border-default bg-surface hover:border-accent/50 hover:bg-elevated'
              }`}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
            >
              <svg
                aria-hidden="true"
                className={`mb-4 h-10 w-10 transition-colors ${isDragging ? 'text-accent' : 'text-text-muted'}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                />
              </svg>
              <p className="mb-1 text-sm font-medium text-text-primary" aria-hidden="true">{t.dropTitle}</p>
              <p className="text-xs text-text-muted" aria-hidden="true">{t.dropSubtitle}</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                className="hidden"
                aria-hidden="true"
                tabIndex={-1}
                onChange={(e) => e.target.files && handleFiles(e.target.files)}
              />
            </div>
          </div>
        )}

        {/* GitHub URL input */}
        {mode === 'github' && (
          <div id="panel-github" role="tabpanel" aria-labelledby="tab-github" className="rounded-2xl border border-border-default bg-surface p-6">
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
