// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

import { useEffect, useRef } from 'react';

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

export const GraphAnimation = () => {
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
