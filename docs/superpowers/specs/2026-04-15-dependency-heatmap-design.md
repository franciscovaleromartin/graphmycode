# Dependency Heatmap — Spec de diseño

**Fecha:** 2026-04-15  
**Estado:** Aprobado

---

## Resumen

Nueva vista `heatmap` en GraphMyCode que muestra un grafo de acoplamiento entre archivos. Los nodos son ficheros (`File`), su color y tamaño codifican el grado total de dependencias, y las aristas bidireccionales (imports mutuos) se resaltan con color y grosor especiales. El layout usa física de repulsión (ForceAtlas2) con play/pause, idéntico al comportamiento de la vista Structural.

---

## Decisiones clave

| Decisión | Elección | Motivo |
|---|---|---|
| Integración | Nueva pestaña (no overlay) | Coherente con Semantic y City |
| Granularidad | Solo nodos `File` | Acoplamiento real a nivel módulo |
| Color nodo | Grado total normalizado | Identifica hubs rápidamente |
| Aristas bidireccionales | Grosor + color naranja por encima | Detecta acoplamiento circular |
| Renderer | Canvas 2D + graphology-layout-forceatlas2 | Sin dependencias nuevas, control total |
| Física | Play/pause como Structural | Consistencia UX |
| Click en nodo | Tooltip flotante + abre panel de código | Opción B elegida por el usuario |
| Paleta de calor | Volcánica: azul → verde → ámbar → rojo | Opción A elegida por el usuario |

---

## Diseño visual

### Nodos
- **Color**: interpolación por grado total normalizado `[0,1]`
  - 0.0 → `#3b82f6` (azul, frío — pocos imports)
  - 0.33 → `#22c55e` (verde)
  - 0.66 → `#f59e0b` (ámbar)
  - 1.0 → `#ef4444` (rojo, caliente — hub muy acoplado)
- **Radio**: `8 + normalizedDegree * 16` px (mínimo 8px, máximo 24px)
- **Label**: nombre del fichero, visible al hacer hover/click

### Aristas
- **Unidireccionales**: línea gris `#334155`, grosor 1.5px, opacidad 0.5
- **Bidireccionales**: línea naranja `#f97316`, grosor proporcional al número de dependencias mutuas (min 3px, max 7px), opacidad 0.85
- **Glow**: halo suave rojizo (`rgba(239,68,68,0.15)`) sobre clusters con muchas aristas bidireccionales

### Tooltip
Al hacer click en un nodo:
- Tooltip flotante en el canvas con: nombre del fichero, grado total, número de conexiones bidireccionales, lista de archivos acoplados
- El panel de código derecho se abre automáticamente mostrando el fichero

---

## Arquitectura

### Nuevos ficheros

**`src/lib/heatmap-metrics.ts`**  
Función pura que recibe un `KnowledgeGraph` y devuelve:
```ts
interface HeatmapData {
  nodes: HeatmapNode[];      // id, label, path, degree, normalizedDegree
  edges: HeatmapEdge[];      // source, target, isBidirectional, weight
  maxDegree: number;
  bidirectionalCount: number;
}
```
- Filtra nodos con `label === 'File'`
- Calcula grado total (entrantes + salientes) por nodo
- Detecta bidireccionalidad: `(A→B) && (B→A)`
- Normaliza grados a `[0,1]`

**`src/components/HeatmapView.tsx`**  
Componente React con:
- `<canvas>` a pantalla completa
- Crea un `graphology.Graph` con los datos de `heatmap-metrics`
- Usa `graphology-layout-forceatlas2` (ya disponible en el proyecto) para calcular posiciones
- Loop `requestAnimationFrame` para renderizado y simulación
- Ref con `{ zoomIn, zoomOut, resetZoom, play, pause }` para integración en `GraphCanvas`
- Pan con drag, zoom con scroll/rueda
- Click en nodo: muestra tooltip + llama `openCodePanel(nodeId)`

### Ficheros modificados

**`src/hooks/useAppState.tsx`**  
```ts
// Antes
graphViewType: 'structural' | 'semantic' | 'city'
// Después
graphViewType: 'structural' | 'semantic' | 'city' | 'heatmap'
```

**`src/components/GraphCanvas.tsx`**  
- Nueva pestaña "Heatmap" junto a Structural / Semantic / City (icono: `GitMerge` o `Network` de lucide)
- Renderiza `<HeatmapView>` cuando `graphViewType === 'heatmap'`
- Conecta los botones zoom/play a los métodos del ref de `HeatmapView`

**`src/screens/SidePanel.tsx`**  
Nueva sección de leyenda para `graphViewType === 'heatmap'`:
- Gradiente de color: azul → verde → ámbar → rojo
- Contador "Bidireccionales" en naranja
- Contador de ficheros analizados

**`src/core/llm/context-builder.ts`**  
Añadir rama `else if (graphViewType === 'heatmap')` con descripción de la vista para el agente LLM.

---

## Flujo de datos

```
KnowledgeGraph (nodes + relationships)
       ↓
heatmap-metrics.ts
  · filtra label === 'File'
  · calcula grado total por nodo
  · detecta aristas bidireccionales
  · normaliza a [0,1]
       ↓
HeatmapView.tsx
  · construye graphology.Graph
  · corre ForceAtlas2 en loop animado
  · renderiza en Canvas 2D
  · click → tooltip + openCodePanel()
```

---

## Fuera de alcance

- Filtro por umbral mínimo de acoplamiento (slider) — puede añadirse en iteración futura
- Exportar el heatmap como imagen
- Mostrar nodos de tipo Folder, Class o Function

---

## Criterios de aceptación

1. La pestaña "Heatmap" aparece en la barra de vistas junto a las existentes
2. Al activarla, se renderizan solo nodos `File` con la paleta volcánica
3. Las aristas bidireccionales son visualmente distintas (naranja, gruesas)
4. La física play/pause funciona igual que en Structural
5. Click en nodo muestra tooltip con métricas y abre el panel de código
6. La leyenda en el sidebar muestra el gradiente de calor y el contador de bidireccionales
7. Zoom y pan funcionan con scroll/drag
8. El agente LLM recibe contexto correcto de la vista heatmap
