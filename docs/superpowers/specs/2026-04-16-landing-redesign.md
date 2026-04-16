# Spec: Rediseño de la Landing Page

**Fecha:** 2026-04-16
**Estado:** Aprobado

---

## Resumen

Rediseño de la sección explicativa de la landing page. El input (ZIP / GitHub URL) y el header (título + tagline) se mantienen intactos. Se sustituye el acordeón `ExplicacionAccordion` por tres tarjetas modernas con fondo negro, organizadas en layout "featured + par".

---

## Layout aprobado — Opción C refinada

```
┌────────────────────────────────────────┐
│  [Header: logo + tagline]  (sin cambio)│
├────────────────────────────────────────┤
│  [Input ZIP / GitHub]      (sin cambio)│
├────────────────────────────────────────┤
│  ┌──────────────────────────────────┐  │
│  │  FEATURED CARD                   │  │
│  │  ─ Canvas animado (heatmap graph)│  │
│  │  ─ "✦ Cuatro vistas"             │  │
│  │  ─ "Entiende cualquier código    │  │
│  │     en segundos"                 │  │
│  │  ─ Grid 2×2 con las 4 vistas     │  │
│  └──────────────────────────────────┘  │
│  ┌─────────────────┐ ┌───────────────┐ │
│  │ PRIVACIDAD       │ │ IA (Opcional) │ │
│  └─────────────────┘ └───────────────┘ │
├────────────────────────────────────────┤
│  [Badge privacidad]        (sin cambio)│
└────────────────────────────────────────┘
```

---

## Card 1 — Featured: "Entiende cualquier código en segundos"

### Cabecera visual
- Canvas 2D animado de altura ~150px con fade inferior hacia el fondo de la card.
- Nodos con colores heatmap (azul → verde → ámbar → rojo) proporcionales a `heat`.
- Aristas bidireccionales en naranja (`rgba(249,115,22)`), aristas normales en gris oscuro.
- Etiquetas flotantes de ficheros reales (`index.ts`, `utils.py`, etc.) en nodos con `heat > 0.68`.
- Nodos con glow radial en rojo cuando `heat > 0.6`.
- Animación continua (RAF), velocidad suave (~0.5 px/frame).

### Contenido
- Tag: `✦ Cuatro vistas` (estilo ámbar)
- Título: **"Entiende cualquier código en segundos"**
- Subtítulo: *"Cuatro formas de ver tu código. Ninguna requiere leer carpeta a carpeta."*
- Grid 2×2 con las 4 vistas, cada una con icono, nombre y bullets `-`:

| Vista | Icono | Bullets |
|---|---|---|
| Structural | 🕸️ | ¿Qué importa este fichero? / ¿Quién llama a esta función? / ¿Qué módulos están aislados? / Sigue el recorrido de la pila fácilmente |
| Semantic 3D | 🧠 | ¿Qué código hace lo mismo? / ¿Hay lógica duplicada? / ¿Qué módulos son similares? / Analiza el impacto real de un cambio más allá de las dependencias directas |
| Technical Debt | 🏙️ | ¿Qué fichero es el más difícil de cambiar? / ¿Dónde está el código más acoplado? / ¿Qué refactorizar primero? / Cuanto más alto el edificio de tu barrio, más deuda técnica |
| Dependency Heatmap | 🔥 | ¿Hay ciclos de importación? / ¿Qué módulos están acoplados circularmente? / ¿Dónde romper dependencias? / Identifica código espagueti |

---

## Card 2 — Privacidad

- Tag: `Privacidad` (estilo teal)
- Icono: 🔒 en caja redondeada con glow teal
- Título: **"Sin servidor. Sin base de datos."**
- Cuerpo: *"Todo corre en tu navegador, en memoria. Al cerrar la pestaña, desaparece sin dejar rastro. Sin telemetría, sin datos personales."*
- Cubre implícitamente: ¿Hay servidor? + ¿Se almacena mi código?
- Glow radial teal en esquina superior derecha.

---

## Card 3 — IA (Opcional)

- Tags: `IA` (estilo violeta) + badge `Opcional`
- Icono: ✦ en caja redondeada con glow violeta
- Título: **"Pregunta sobre tu código"**
- Cuerpo: *"Conecta tu API key (OpenAI, Gemini, Anthropic u Ollama) y hazle preguntas en lenguaje natural. Con Ollama, el código no sale de tu máquina."*
- Glow radial violeta en esquina superior derecha.

---

## Paleta y estilo

- Fondo de página: `#09090b` (void)
- Fondo de cards: `#0c111d`
- Bordes: `#1e293b` en reposo, `#2d3748` en hover
- Glows ambientales: violeta y verde (fijos, `position: fixed`)
- Fuente: system-ui / Inter
- Badge dot de privacidad: verde `#22c55e` con animación pulse

---

## Componentes a crear / modificar

| Archivo | Acción |
|---|---|
| `src/screens/LandingScreen.tsx` | Eliminar `ExplicacionAccordion`, añadir `LandingCards` inline o como componente separado |
| `src/screens/LandingScreen.tsx` | Añadir canvas animado como componente interno `GraphAnimation` |
| `src/lib/i18n.ts` | Actualizar claves de texto (o añadir nuevas) para las tarjetas |

---

## Lo que NO cambia

- Header (logo, tagline, "por Francisco Valero")
- Tab switcher ZIP / GitHub
- Drop zone y GitHub input
- Badge "Tu código nunca sale de tu navegador"
- Lógica de procesamiento (todo el código JS fuera del JSX)
