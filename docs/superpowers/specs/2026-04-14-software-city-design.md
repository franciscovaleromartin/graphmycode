# Spec: Vista SoftwareCity — Deuda Técnica 3D

**Fecha:** 2026-04-14  
**Proyecto:** graphmycode  
**Estado:** Aprobado

---

## Objetivo

Añadir una tercera vista al grafo (`graphViewType: 'city'`) que representa el repositorio analizado como una ciudad 3D donde cada nodo del grafo es un edificio. El objetivo es permitir detectar de un vistazo nodos problemáticos (alta conectividad, alta profundidad) mediante la altura y el color de los edificios.

---

## Stack tecnológico

- **Renderer 3D:** `@react-three/fiber` + `@react-three/drei` (Three.js)
- **Referencia de layout:** algoritmo treemap recursivo inspirado en [Manavarya09/code-city](https://github.com/Manavarya09/code-city)
- **Sin backend:** 100% cliente, sin dependencias de servidor adicionales
- **Integración:** se monta/desmonta igual que `<SemanticGraph>` en `GraphCanvas.tsx`

---

## Arquitectura

### Nuevos archivos

```
src/components/CityView.tsx           # componente raíz: <Canvas> de r3f
src/components/city/CityBuildings.tsx # InstancedMesh con todos los edificios
src/components/city/CityDistricts.tsx # planos de suelo por carpeta (distrito)
src/components/city/CityTooltip.tsx   # tooltip HTML flotante sobre hover
src/lib/city-layout.ts                # algoritmo treemap → posiciones y métricas
```

### Archivos modificados

| Archivo | Cambio |
|---|---|
| `src/hooks/useAppState.tsx` | Ampliar `graphViewType` a `'structural' \| 'semantic' \| 'city'` |
| `src/components/GraphCanvas.tsx` | Añadir rama `graphViewType === 'city'` para montar `<CityView>` |
| `src/screens/SidePanel.tsx` | Añadir botón "Ciudad" al selector de vista |

---

## Datos y layout

### Entrada

Los `GraphNode[]` y `GraphRelationship[]` del `KnowledgeGraph` existente en `AppState`.

### Transformación (`city-layout.ts`)

**Paso 1 — Agrupación en distritos:**
- Cada nodo se asigna a un distrito basándose en la carpeta raíz de su `filePath` o `name`
- Nodos sin path reconocible van al distrito `__root__`

**Paso 2 — Cálculo de métricas:**
- `degree`: número de relaciones donde el nodo es origen o destino (conteo en `relationships[]`)
- `depth`: número de separadores `/` en el path del nodo (mínimo 0)
- Ambas métricas se normalizan al rango `[0.5, 8.0]` unidades Three.js

**Paso 3 — Layout treemap recursivo:**
- El área total del plano XZ se divide entre distritos proporcionalmente a su número de nodos
- Dentro de cada distrito, los nodos se distribuyen en cuadrícula uniforme
- Cada nodo recibe `(x, z)` centro, `width` y `depth` de planta fijos (1.0 × 1.0 u.)
- La altura `y` del edificio = métrica activa normalizada

### Estructura de salida

```ts
interface CityBuilding {
  nodeId: string
  x: number          // posición centro en eje X
  z: number          // posición centro en eje Z
  width: number      // ancho de planta (fijo: 1.0)
  depth: number      // profundidad de planta (fijo: 1.0)
  height: number     // métrica normalizada [0.5, 8.0]
  color: number      // color hex: base por tipo + lerp hacia #ff4444 según métrica
  districtId: string // carpeta padre
}
```

### Colores

- **Color base:** extraído de `graph-adapter.ts` (mismo color que usa Sigma por tipo de nodo)
- **Tinte calor:** interpolación lineal entre color base y `#ff4444` proporcional al valor de la métrica normalizada
- El edificio más alto del conjunto siempre aparece en rojo puro; los más bajos conservan el color base

---

## Componentes

### `<CityView>`

Canvas r3f a pantalla completa. Configura:
- Cámara perspectiva en posición isométrica elevada (ángulo ~45°) al montar
- Iluminación: `ambientLight` (0.6) + `directionalLight` desde arriba-frente
- Monta `<CityBuildings>`, `<CityDistricts>`, `<CityTooltip>`
- Recibe `buildings: CityBuilding[]` precalculados desde `city-layout.ts`

### `<CityBuildings>`

- Renderiza todos los edificios como un único `InstancedMesh` (`BoxGeometry` 1×1×1 escalada por instancia)
- Usa `MeshStandardMaterial` con `vertexColors`
- Gestiona raycasting para hover y click:
  - `onPointerMove`: extrae `instanceId` → actualiza estado hover local
  - `onPointerDown`: llama `setSelectedNode(nodeId)` + `openCodePanel()` del AppState
- Al cambiar la métrica activa: sólo actualiza el buffer de matrices y colores sin re-layout completo

### `<CityDistricts>`

- Un `PlaneGeometry` por distrito con color neutro oscuro (`#1a1a2e`)
- Etiqueta con el nombre de la carpeta renderizada con `<Text>` de drei

### `<CityTooltip>`

- Componente `<Html>` de drei anclado al edificio en hover
- Muestra: nombre del nodo, tipo, valor de métrica activa
- Desaparece al salir del hover o al hacer click

---

## UI de control

### Selector de métrica

Pill flotante sobre el canvas (esquina superior derecha) con dos opciones:
- `Conexiones` — métrica `degree`
- `Profundidad` — métrica `depth`

Estilo visual coherente con los controles existentes de `GraphCanvas` (mismos tokens Tailwind).

### Botón en SidePanel

Icono `Building2` de lucide-react añadido al grupo de botones de vista junto a los existentes (estructural / semántico). Al activarse, establece `graphViewType = 'city'`.

---

## Interactividad

| Acción | Comportamiento |
|---|---|
| Orbitar | Click izquierdo + arrastrar (`OrbitControls`) |
| Zoom | Rueda del ratón |
| Pan | Click derecho + arrastrar |
| Hover edificio | Aparece `<CityTooltip>` con nombre + métrica |
| Click edificio | Selecciona nodo en AppState + abre panel lateral de código |
| Cambiar métrica | Recalcula alturas y colores sin re-layout (actualiza buffers) |

---

## Rendimiento (500–2.000 nodos)

- Un único `InstancedMesh` por escena: 1 draw call para todos los edificios
- El recálculo de métrica no re-ejecuta el treemap, solo actualiza matrices de instancia
- Los distritos (planos) son geometrías estáticas; no se actualizan al cambiar métrica
- El raycasting opera sobre el `InstancedMesh`, no sobre objetos individuales

---

## Restricciones

- No requiere backend ni acceso a red adicional
- No rompe las vistas `'structural'` ni `'semantic'` existentes
- El tipo `graphViewType` se amplía de forma retrocompatible (el valor por defecto sigue siendo `'structural'`)
- Los tests de unidad existentes no se modifican
