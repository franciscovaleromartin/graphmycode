# Landing Page Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir el acordeón `ExplicacionAccordion` de la landing por tres tarjetas modernas (featured + par) con canvas animado de grafo heatmap.

**Architecture:** Todo el nuevo código vive en `LandingScreen.tsx` como componentes internos (`GraphAnimation` + `LandingCards`). Los textos se mueven a claves nuevas en `i18n.ts`. El resto de la pantalla (header, input, badge) no se toca.

**Tech Stack:** React 18, TypeScript, Tailwind CSS (clases inline vía `style`), Canvas 2D API, `requestAnimationFrame`.

---

## Archivos afectados

| Archivo | Acción |
|---|---|
| `src/screens/LandingScreen.tsx` | Eliminar `ExplicacionAccordion`, añadir `GraphAnimation` y `LandingCards` |
| `src/lib/i18n.ts` | Reemplazar claves `accordion*` por claves `cards*` |

---

### Task 1: Actualizar i18n — reemplazar claves del acordeón por claves de tarjetas

**Files:**
- Modify: `src/lib/i18n.ts`

- [ ] **Step 1: Sustituir el bloque `accordion*` de la sección `es` por las nuevas claves**

Localiza el bloque que empieza en `accordionTitle` (línea ~36) y reemplázalo completo por:

```ts
// ── Landing cards ─────────────────────────────────────────────────
cardsViewsTag: '✦ Cuatro vistas',
cardsViewsTitle: 'Entiende cualquier código en segundos',
cardsViewsSub: 'Cuatro formas de ver tu código. Ninguna requiere leer carpeta a carpeta.',
cardsStructuralName: 'Structural',
cardsStructuralBullets: [
  '¿Qué importa este fichero?',
  '¿Quién llama a esta función?',
  '¿Qué módulos están aislados?',
  'Sigue el recorrido de la pila fácilmente',
],
cardsSemanticName: 'Semantic 3D',
cardsSemanticBullets: [
  '¿Qué código hace lo mismo?',
  '¿Hay lógica duplicada?',
  '¿Qué módulos son similares?',
  'Analiza el impacto real de un cambio más allá de las dependencias directas',
],
cardsDebtName: 'Technical Debt',
cardsDebtBullets: [
  '¿Qué fichero es el más difícil de cambiar?',
  '¿Dónde está el código más acoplado?',
  '¿Qué refactorizar primero?',
  'Cuanto más alto el edificio de tu barrio, más deuda técnica',
],
cardsHeatmapName: 'Dependency Heatmap',
cardsHeatmapBullets: [
  '¿Hay ciclos de importación?',
  '¿Qué módulos están acoplados circularmente?',
  '¿Dónde romper dependencias?',
  'Identifica código espagueti',
],
cardsPrivacyTag: 'Privacidad',
cardsPrivacyTitle: 'Sin servidor.\nSin base de datos.',
cardsPrivacyBody: 'Todo corre en tu navegador, en memoria. Al cerrar la pestaña, desaparece sin dejar rastro. Sin telemetría, sin datos personales.',
cardsAiTag: 'IA',
cardsAiOptional: 'Opcional',
cardsAiTitle: 'Pregunta sobre tu código',
cardsAiBody: 'Conecta tu API key (OpenAI, Gemini, Anthropic u Ollama) y hazle preguntas en lenguaje natural. Con Ollama, el código no sale de tu máquina.',
```

- [ ] **Step 2: Sustituir el bloque `accordion*` de la sección `en` por las nuevas claves**

Localiza el bloque equivalente en inglés (línea ~132) y reemplázalo por:

```ts
// ── Landing cards ─────────────────────────────────────────────────
cardsViewsTag: '✦ Four views',
cardsViewsTitle: 'Understand any codebase in seconds',
cardsViewsSub: 'Four ways to see your code. None require reading folder by folder.',
cardsStructuralName: 'Structural',
cardsStructuralBullets: [
  'What does this file import?',
  'Who calls this function?',
  'Which modules are isolated?',
  'Follow the call stack easily',
],
cardsSemanticName: 'Semantic 3D',
cardsSemanticBullets: [
  'What code does the same thing?',
  'Is there duplicated logic?',
  'Which modules are similar?',
  'Analyze the real impact of a change beyond direct dependencies',
],
cardsDebtName: 'Technical Debt',
cardsDebtBullets: [
  'Which file is the hardest to change?',
  'Where is the most coupled code?',
  'What should be refactored first?',
  'The taller the building in your district, the more technical debt',
],
cardsHeatmapName: 'Dependency Heatmap',
cardsHeatmapBullets: [
  'Are there import cycles?',
  'Which modules are circularly coupled?',
  'Where to break dependencies?',
  'Identify spaghetti code',
],
cardsPrivacyTag: 'Privacy',
cardsPrivacyTitle: 'No server.\nNo database.',
cardsPrivacyBody: 'Everything runs in your browser, in memory. When you close the tab, it disappears without a trace. No telemetry, no personal data.',
cardsAiTag: 'AI',
cardsAiOptional: 'Optional',
cardsAiTitle: 'Ask about your code',
cardsAiBody: 'Connect your API key (OpenAI, Gemini, Anthropic or Ollama) and ask questions in natural language. With Ollama, your code never leaves your machine.',
```

- [ ] **Step 3: Actualizar el tipo `Translations` para incluir las nuevas claves de arrays**

En la interfaz/tipo que describe las traducciones (si existe como `type` o `interface`), o simplemente verificar que TypeScript no protesta con `npx tsc --noEmit`.

- [ ] **Step 4: Verificar que compila**

```bash
npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/lib/i18n.ts
git commit -m "feat: reemplazar claves accordion por claves cards en i18n"
```

---

### Task 2: Añadir componente `GraphAnimation` — canvas animado

**Files:**
- Modify: `src/screens/LandingScreen.tsx` (añadir antes de `ExplicacionAccordion`)

- [ ] **Step 1: Añadir el componente `GraphAnimation` justo después de los imports, antes de `ExplicacionAccordion`**

```tsx
// ── GraphAnimation ────────────────────────────────────────────────

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

interface GraphNode {
  x: number; y: number;
  vx: number; vy: number;
  r: number; heat: number;
  phase: number; speed: number;
}

interface GraphEdge { i: number; j: number; bidir: boolean; }

function buildGraphData(W: number, H: number): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = Array.from({ length: 40 }, () => {
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

  const edges: GraphEdge[] = [];
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
  const dataRef = useRef<{ nodes: GraphNode[]; edges: GraphEdge[] } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    dataRef.current = buildGraphData(W, H);

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
      {/* Fade inferior hacia el fondo de la card */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '70px',
        background: 'linear-gradient(to bottom, transparent, #0c111d)',
        pointerEvents: 'none',
      }} />
    </div>
  );
};
```

- [ ] **Step 2: Verificar que compila**

```bash
npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/screens/LandingScreen.tsx
git commit -m "feat: añadir componente GraphAnimation con canvas heatmap animado"
```

---

### Task 3: Añadir componente `LandingCards` y reemplazar el acordeón

**Files:**
- Modify: `src/screens/LandingScreen.tsx`

- [ ] **Step 1: Añadir el componente `LandingCards` justo después de `GraphAnimation`**

```tsx
// ── LandingCards ─────────────────────────────────────────────────

const VIEWS = (t: ReturnType<typeof useT>) => [
  { icon: '🕸️', name: t.cardsStructuralName, bullets: t.cardsStructuralBullets },
  { icon: '🧠', name: t.cardsSemanticName,   bullets: t.cardsSemanticBullets },
  { icon: '🏙️', name: t.cardsDebtName,       bullets: t.cardsDebtBullets },
  { icon: '🔥', name: t.cardsHeatmapName,    bullets: t.cardsHeatmapBullets },
];

const LandingCards = () => {
  const t = useT();
  const views = VIEWS(t);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

      {/* ── Featured card ── */}
      <div style={{
        borderRadius: '16px', border: '1px solid #1e293b',
        background: '#0c111d', overflow: 'hidden',
      }}>
        <GraphAnimation />
        <div style={{ padding: '4px 22px 22px' }}>
          {/* Tag */}
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

          {/* Views grid */}
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

        {/* Privacy card */}
        <div style={{
          borderRadius: '14px', border: '1px solid #1e293b',
          background: '#0c111d', padding: '18px 20px', position: 'relative', overflow: 'hidden',
        }}>
          {/* Teal glow */}
          <div style={{
            position: 'absolute', top: '-30px', right: '-30px',
            width: '100px', height: '100px', borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(45,212,191,.12) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />
          {/* Icon */}
          <div style={{
            width: '32px', height: '32px', borderRadius: '9px', display: 'flex',
            alignItems: 'center', justifyContent: 'center', fontSize: '14px', marginBottom: '12px',
            background: 'rgba(45,212,191,.1)', border: '1px solid rgba(45,212,191,.2)',
          }}>🔒</div>
          {/* Tag */}
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

        {/* AI card */}
        <div style={{
          borderRadius: '14px', border: '1px solid #1e293b',
          background: '#0c111d', padding: '18px 20px', position: 'relative', overflow: 'hidden',
        }}>
          {/* Violet glow */}
          <div style={{
            position: 'absolute', top: '-30px', right: '-30px',
            width: '100px', height: '100px', borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(167,139,250,.14) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />
          {/* Icon */}
          <div style={{
            width: '32px', height: '32px', borderRadius: '9px', display: 'flex',
            alignItems: 'center', justifyContent: 'center', fontSize: '14px', marginBottom: '12px',
            background: 'rgba(167,139,250,.1)', border: '1px solid rgba(167,139,250,.2)',
          }}>✦</div>
          {/* Tags row */}
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
```

- [ ] **Step 2: En el JSX del componente `LandingScreen`, reemplazar `<ExplicacionAccordion />` por `<LandingCards />`**

Busca la línea:
```tsx
        {/* Explicación desplegable */}
        <ExplicacionAccordion />
```

Reemplázala por:
```tsx
        {/* Tarjetas informativas */}
        <LandingCards />
```

- [ ] **Step 3: Eliminar el componente `ExplicacionAccordion` del archivo**

Elimina el bloque completo que va desde:
```tsx
// ── Explicación Accordion ─────────────────────────────────────────────────────

const ExplicacionAccordion = () => {
```
hasta su cierre `};` (inclusivo).

- [ ] **Step 4: Verificar que compila sin errores**

```bash
npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 5: Arrancar el servidor de desarrollo y verificar visualmente**

```bash
npm run dev
```

Abrir `http://localhost:5173` y comprobar:
- Canvas animado visible con nodos de colores
- Grid 2×2 de vistas con bullets
- Tarjetas Privacy e IA correctas
- El header y el input no han cambiado

- [ ] **Step 6: Commit**

```bash
git add src/screens/LandingScreen.tsx
git commit -m "feat: reemplazar acordeón por tarjetas modernas con canvas animado en landing"
```

---

### Task 4: Push final

- [ ] **Step 1: Push a main**

```bash
git push origin main
```
