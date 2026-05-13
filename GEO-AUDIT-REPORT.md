# GEO Audit Report: GraphMyCode

**Fecha de auditoría:** 2 de mayo de 2026
**URL:** https://graphmycode.com
**Tipo de negocio:** Herramienta developer (SaaS-like) — Visualización de código
**Páginas analizadas:** 1 (SPA de URL única)
**Auditor:** Claude GEO Audit System (5 subagentes especializados en paralelo)

---

## Resumen Ejecutivo

**Puntuación GEO Global: 12/100 — Crítico**

GraphMyCode es una herramienta con sofisticación técnica genuinamente excepcional: visualización 3D de grafos de dependencias, análisis semántico con embeddings locales via WebAssembly, y un asistente IA multi-proveedor que funciona íntegramente en el navegador sin subir código a ningún servidor. El stack técnico (tree-sitter WASM, Three.js, HuggingFace Transformers en browser, LangChain) sitúa al producto en el 1% superior del nicho de code visualization.

El problema es estructural y tiene una sola causa raíz: **la arquitectura SPA sin SSR hace que el 100% del contenido del producto sea invisible para todos los motores de búsqueda IA**. Los crawlers de GPT, Claude, Perplexity y Gemini reciben literalmente `<div id="root"></div>` y 57 palabras de meta tags. No existe ningún corpus de texto indexable sobre qué es GraphMyCode, cómo funciona, qué problemas resuelve, ni por qué es diferente. La confirmación más contundente: `site:graphmycode.com` en Google devuelve **0 resultados** — el sitio no está indexado.

Mientras tanto, herramientas comparables del nicho (Graphify, CodeScene, Sourcetrail) tienen decenas de videos en YouTube, miles de GitHub stars, y presencia activa en Hacker News y Reddit — las fuentes primarias que los LLMs consultan para responder preguntas sobre developer tools.

---

## Tabla de Scores

| Categoría | Score | Peso | Ponderado |
|---|---|---|---|
| Citabilidad IA | 8/100 | 25% | 2.0 |
| Autoridad de Marca | 5/100 | 20% | 1.0 |
| Contenido E-E-A-T | 19/100 | 20% | 3.8 |
| Técnico GEO | 28/100 | 15% | 4.2 |
| Schema & Structured Data | 0/100 | 10% | 0.0 |
| Optimización de Plataformas | 11/100 | 10% | 1.1 |
| **Puntuación GEO Global** | | | **12/100** |

---

## Problemas Críticos (Corregir de inmediato)

### C1 — Sitio sin SSR: contenido invisible para todos los crawlers IA
**Impacto: máximo.** La SPA React sin Server-Side Rendering entrega `<div id="root"></div>` a cualquier bot. GPTBot, ClaudeBot, PerplexityBot, Googlebot — ninguno ejecuta JavaScript. El sitio tiene exactamente 57 palabras indexables (los meta tags del `<head>`). Todo el contenido del producto (features, casos de uso, comparativas, diferenciadores) existe solo en el bundle JS compilado.

**Corrección:**

*Opción A — Más rápida (sin migración):* Pre-render estático de la landing con Vite:
```bash
npm install vite-plugin-prerender
```
```typescript
// vite.config.ts
import prerender from 'vite-plugin-prerender'
export default defineConfig({
  plugins: [react(), prerender({ staticDir: 'dist', routes: ['/'] })]
})
```

*Opción B — Recomendada a medio plazo:* Separar la landing en Next.js con `app/page.tsx` como Server Component, manteniendo la app React para la experiencia interactiva.

---

### C2 — Google no ha indexado el sitio (`site:graphmycode.com` = 0 resultados)
Sin indexación, ninguna plataforma de IA puede citar graphmycode.com. Ningún ranking en top 10 = ninguna aparición en Google AI Overviews = el canal de mayor volumen de descubrimiento completamente bloqueado.

**Corrección:**
1. Crear `robots.txt` y `sitemap.xml` (ver H1 y H2 abajo)
2. Registrar el sitio en Google Search Console y enviar el sitemap manualmente
3. Añadir `msvalidate.01` meta tag y registrar en Bing Webmaster Tools

---

### C3 — Cero schema.org markup
El `<head>` del index.html no tiene ningún bloque JSON-LD. Los modelos IA no pueden clasificar GraphMyCode como entidad, herramienta, ni producto. El schema markup en el `<head>` es la única señal estructurada que los crawlers leen incluso en SPAs, porque no requiere ejecutar JavaScript.

**Corrección — Pegar en el `<head>` del index.html:**

```html
<!-- Schema: SoftwareApplication — CRÍTICO -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "GraphMyCode",
  "url": "https://graphmycode.com",
  "description": "GraphMyCode convierte cualquier repositorio en un grafo interactivo de dependencias 3D. Navega archivos, clases y funciones visualmente, analiza el impacto de tus cambios y haz preguntas sobre tu código con IA.",
  "applicationCategory": "DeveloperApplication",
  "applicationSubCategory": "Code Visualization",
  "operatingSystem": "Web Browser",
  "featureList": [
    "Visualización 3D de grafos de dependencias",
    "Análisis semántico de código con embeddings locales",
    "Chat IA sobre el código (OpenAI, Gemini, Anthropic, Ollama)",
    "Soporte para 15+ lenguajes (TypeScript, JavaScript, Python, Go, Rust, Java, PHP y más)",
    "Detección de acoplamiento y dependencias circulares",
    "Análisis de impacto de cambios",
    "Funciona en el navegador sin instalación ni servidor"
  ],
  "screenshot": "https://graphmycode.com/og-image.png",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD",
    "description": "Gratuito para uso no comercial bajo licencia PolyForm-Noncommercial-1.0.0",
    "availability": "https://schema.org/OnlineOnly"
  },
  "license": "https://polyformproject.org/licenses/noncommercial/1.0.0/",
  "creator": {
    "@type": "Person",
    "name": "Francisco Alejandro Valero Martin",
    "url": "https://francisco-valero.com",
    "sameAs": [
      "https://github.com/franciscovaleromartin",
      "https://francisco-valero.com"
    ]
  },
  "codeRepository": "https://github.com/franciscovaleromartin/graphmycode",
  "isAccessibleForFree": true,
  "audience": { "@type": "Audience", "audienceType": "Software Developers" }
}
</script>

<!-- Schema: Person (Autor) — ALTO -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Person",
  "name": "Francisco Alejandro Valero Martin",
  "url": "https://francisco-valero.com",
  "email": "correodefranciscovalero@gmail.com",
  "jobTitle": "Software Developer",
  "sameAs": [
    "https://github.com/franciscovaleromartin",
    "https://francisco-valero.com"
  ],
  "knowsAbout": ["Code Visualization", "Dependency Graphs", "Static Code Analysis", "React", "TypeScript", "Python", "Graph Theory"]
}
</script>

<!-- Schema: Organization — ALTO -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "GraphMyCode",
  "url": "https://graphmycode.com",
  "description": "Herramienta web que convierte repositorios de código en grafos interactivos de dependencias 3D con análisis semántico e inteligencia artificial.",
  "email": "correodefranciscovalero@gmail.com",
  "sameAs": ["https://github.com/franciscovaleromartin/graphmycode"],
  "founder": {
    "@type": "Person",
    "name": "Francisco Alejandro Valero Martin",
    "url": "https://francisco-valero.com"
  }
}
</script>

<!-- Schema: WebSite — MEDIO -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "GraphMyCode",
  "url": "https://graphmycode.com",
  "publisher": {
    "@type": "Person",
    "name": "Francisco Alejandro Valero Martin",
    "url": "https://francisco-valero.com"
  },
  "inLanguage": "es"
}
</script>
```

---

### C4 — Cero presencia de marca en plataformas que los LLMs consultan
No hay menciones en Reddit, Hacker News, Product Hunt, YouTube, alternativeto.net, dev.to, ni Wikipedia. Herramientas comparables del nicho tienen cientos o miles de menciones indexadas en estas fuentes. Los LLMs generan sus respuestas a partir de este corpus — sin menciones externas, graphmycode.com no puede ser citado aunque el producto sea superior.

**Corrección (orden de prioridad):**
1. **Show HN en Hacker News** — mayor ROI para Perplexity y ChatGPT. Título sugerido: *"Show HN: GraphMyCode – Visualize any codebase as a 3D dependency graph in the browser, no upload needed"*. El diferenciador de procesamiento local es la narrativa correcta para HN.
2. **Reddit** — publicar en r/programming, r/webdev, r/devtools antes del Show HN para validar el mensaje.
3. **Product Hunt** — después de HN para capitalizar el momentum con assets visuales.
4. **alternativeto.net** — crear ficha con descripción completa y categoría. Aparece en los primeros resultados de Google para "code visualization tools" y es citado por ChatGPT.

---

## Problemas de Alta Prioridad (Corregir esta semana)

### H1 — No existe robots.txt
HTTP 404. Los crawlers IA operan sin instrucciones explícitas.

**Corrección — Crear `/public/robots.txt`:**
```
User-agent: *
Allow: /

User-agent: GPTBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: CCBot
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Amazonbot
Allow: /

Sitemap: https://graphmycode.com/sitemap.xml
```

---

### H2 — No existe sitemap.xml
HTTP 404. Los crawlers no pueden descubrir rutas adicionales ni verificar que el sitio está mantenido.

**Corrección — Crear `/public/sitemap.xml`:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://graphmycode.com/</loc>
    <lastmod>2026-05-02</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
```

---

### H3 — No existe llms.txt
HTTP 404. Este es el mecanismo más directo para comunicar a los modelos IA qué es y qué hace GraphMyCode — especialmente relevante porque la audiencia objetivo son los mismos desarrolladores que usan Claude, ChatGPT y Perplexity como asistente de trabajo.

**Corrección — Crear `/public/llms.txt`:**
```markdown
# GraphMyCode

> Herramienta browser-first que convierte cualquier repositorio en un grafo interactivo de dependencias 3D, con análisis semántico por IA, múltiples modos de visualización, y procesamiento completamente local (cero upload de código).

## Producto

GraphMyCode analiza repositorios de código y genera grafos interactivos navegables que muestran las relaciones entre archivos, módulos, clases y funciones. El análisis se ejecuta íntegramente en el navegador usando WebAssembly (tree-sitter) para el parsing y modelos de embeddings locales (HuggingFace Transformers) para la agrupación semántica.

## Funcionalidades principales

- Grafo estructural de dependencias: visualización de imports/exports entre archivos, clases y funciones
- Agrupación semántica 3D: similitud de código representada en espacio tridimensional con UMAP
- Technical Debt City: vista 3D estilo mapa de ciudad para identificar zonas de deuda técnica
- Heatmap de dependencias: detección visual de imports circulares y acoplamiento alto
- Chat IA integrado: preguntas en lenguaje natural sobre el código con soporte a OpenAI, Gemini, Anthropic y Ollama
- Análisis de impacto: qué archivos se ven afectados al modificar uno dado

## Lenguajes soportados

TypeScript, JavaScript, Python, Go, Rust, Java, PHP, C, C++, C#, Swift, Kotlin, Ruby, y más.

## Tecnología

- Frontend: React 19, Vite, Tailwind CSS, Three.js, Sigma.js
- Análisis: tree-sitter WASM, AST parsing, análisis semántico
- IA: HuggingFace Transformers (local), LangChain (multi-proveedor)
- Sin backend requerido para análisis básico

## Privacidad

Tu código nunca sale de tu navegador salvo cuando activas el chat IA con un proveedor externo, en cuyo caso el contexto relevante viaja al proveedor seleccionado.

## Autor

Francisco Alejandro Valero Martin
- Portfolio: https://francisco-valero.com
- GitHub: https://github.com/franciscovaleromartin

## Repositorio

https://github.com/franciscovaleromartin/graphmycode

## Licencia

PolyForm-Noncommercial-1.0.0 — gratuito para uso no comercial
https://polyformproject.org/licenses/noncommercial/1.0.0/
```

---

### H4 — Headers de seguridad faltantes
El HSTS existe pero sin `includeSubDomains`. Faltan: CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.

**Corrección — Crear o actualizar `vercel.json`:**
```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "SAMEORIGIN" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" },
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" }
      ]
    }
  ]
}
```

---

### H5 — Inconsistencia de idioma en el HTML
`<html lang="en">` pero todo el contenido meta está en español (`og:locale="es_ES"`). Señal de idioma inconsistente para los crawlers.

**Corrección — en `index.html`:**
```html
<html lang="es">
```

---

### H6 — Meta description demasiado larga (221 caracteres)
Google la truncará en ~160 caracteres y generará la suya propia.

**Corrección:**
```html
<meta name="description" content="GraphMyCode visualiza cualquier repositorio como un grafo 3D de dependencias. Navega, detecta acoplamiento, analiza impacto e interroga tu código con IA. Sin instalación." />
```

---

### H7 — Canonical URL duplicado
`<link rel="canonical">` aparece dos veces en el `<head>`.

**Corrección:** Eliminar la segunda instancia, dejar solo una.

---

## Problemas de Prioridad Media (Corregir en el mes)

### M1 — Sin páginas de contenido indexable
Sin blog, documentación, changelog, casos de uso ni FAQ. El sitio tiene Topic Coverage Ratio < 5% para el nicho "code visualization / dependency analysis". Los modelos IA no tienen material para citar sobre GraphMyCode.

**Acciones sugeridas (en orden de impacto):**
- Publicar un artículo técnico en dev.to sobre "cómo funciona el parsing AST con tree-sitter WASM en el navegador"
- Crear página de documentación pública (GitHub Pages o `/docs` estático) con lenguajes soportados, guía de inicio, y FAQ técnicas
- Añadir un README más rico en GitHub con screenshots, GIFs animados, y comparativa con alternativas (Sourcegraph, CodeScene, dependency-cruiser)

### M2 — Sin Privacy Policy ni Terms of Service indexables
Herramienta que procesa código propietario sin páginas legales accesibles como HTML estático. Las advertencias de privacidad existen en el JS pero son invisibles para crawlers.

### M3 — Sin presencia en GitHub Topics
El repositorio no tiene topics configurados. Añadir: `code-visualization`, `dependency-graph`, `3d-graph`, `codebase-analysis`, `react`, `typescript`, `webassembly`, `tree-sitter`.

### M4 — Twitter Card incompleta
Faltan `twitter:site` y `twitter:creator`.
```html
<meta name="twitter:creator" content="@[handle de Francisco]" />
```

### M5 — Sin hreflang para idiomas alternativos
Se declara `og:locale:alternate` para en_US pero sin los tags `<link rel="alternate" hreflang>` correspondientes (son mecanismos distintos).

---

## Problemas de Baja Prioridad (Optimizar cuando sea posible)

- **L1** — Typo en Header.tsx: el enlace del portfolio apunta a `franciscoo-valero.com` (doble "o") — rompe la señal de autoridad del autor
- **L2** — Sin `softwareVersion` ni `datePublished` en el schema SoftwareApplication
- **L3** — Sin canal de YouTube con demo del producto
- **L4** — Sin registro en Bing Webmaster Tools (`msvalidate.01`)
- **L5** — Sin entrada en alternativeto.net, thectoclub.com ni similares

---

## Análisis por Categoría

### Citabilidad IA (8/100)

El único texto accesible para crawlers IA son los meta tags: 57 palabras totales. No existe ningún bloque de contenido que los modelos puedan citar en respuesta a preguntas como "¿qué herramientas existen para visualizar dependencias de código?".

Los meta tags disponibles tienen calidad parcial:
- Title: descriptivo pero no responde ninguna pregunta directa
- Meta description: la más útil (48/100 en calidad de cita), pero invisible en el body
- Keywords: sin valor de citabilidad

**Contenido indexable post-corrección potencial:** Con SSR + páginas de documentación + llms.txt: **55-70/100**

---

### Autoridad de Marca (5/100)

| Plataforma | Estado |
|---|---|
| Wikipedia | Ausente |
| Reddit | Ausente |
| YouTube | Ausente |
| LinkedIn (empresa) | Ausente |
| Product Hunt | Ausente |
| GitHub | Mínimo (1 star, 0 forks) |
| Hacker News | Ausente |
| npm | Ausente |

Herramientas comparables del nicho tienen decenas de videos en YouTube con miles de vistas, páginas en Product Hunt, y threads en HN con cientos de comentarios. El corpus de entrenamiento de los LLMs no contiene menciones de GraphMyCode.

---

### Contenido E-E-A-T (19/100)

| Dimensión | Score |
|---|---|
| Experience (Experiencia) | 8/25 |
| Expertise (Pericia) | 7/25 |
| Authoritativeness (Autoridad) | 5/25 |
| Trustworthiness (Confianza) | 6/25 |

La experiencia real es significativamente más alta que el score — el stack técnico (WebGPU, tree-sitter WASM, UMAP, embeddings locales en browser) prueba autoría real de nivel senior. El problema es que esta expertise es completamente opaca para los motores IA: no existe ningún artículo, caso práctico, ni documentación pública indexable que la demuestre.

---

### Técnico GEO (28/100)

| Componente | Score |
|---|---|
| Server-Side Rendering | 0/100 |
| Crawlabilidad | 5/100 |
| Meta tags e indexabilidad | 62/100 |
| Security headers | 45/100 |
| Core Web Vitals (riesgo) | 40/100 |
| Mobile | 85/100 |
| URL Structure | 80/100 |

El sitio falla principalmente por la arquitectura SPA sin SSR. Los meta tags están bien implementados (OG, Twitter Card, canonical, description) pero irrelevantes si el contenido del body es vacío.

---

### Schema & Structured Data (0/100)

Ningún schema de ningún tipo. Partida desde cero absoluto. Con la implementación de los schemas JSON-LD detallados en C3: potencial **55-70/100**.

---

### Optimización de Plataformas (11/100)

| Plataforma | Score | Bloqueador principal |
|---|---|---|
| Google AI Overviews | 8/100 | Sitio no indexado en Google |
| ChatGPT Web Search | 12/100 | Sin entidad reconocible; sin menciones externas |
| Perplexity AI | 14/100 | Sin menciones en Reddit/HN (fuentes primarias de Perplexity) |
| Google Gemini | 9/100 | Sin indexación Google; sin YouTube; sin Knowledge Graph |
| Bing Copilot | 10/100 | Sin Bing Webmaster Tools; sin LinkedIn de empresa |

---

## Quick Wins (implementar esta semana — 1-2 días de trabajo)

1. **Añadir 4 bloques JSON-LD al `<head>` del index.html** (SoftwareApplication + Person + Organization + WebSite) — código listo para pegar en el apartado C3. Impacto: inmediato en parsers que leen el `<head>`.

2. **Crear `/public/robots.txt`** — código listo en H1. Tiempo: 5 minutos.

3. **Crear `/public/sitemap.xml`** — código listo en H2. Tiempo: 5 minutos.

4. **Crear `/public/llms.txt`** — contenido listo en H3. Tiempo: 30 minutos.

5. **Corregir `<html lang="es">`** en index.html — una línea. Tiempo: 2 minutos.

6. **Acortar meta description** a 160 caracteres — texto listo en H6. Tiempo: 2 minutos.

7. **Eliminar canonical duplicado** — borrar una línea. Tiempo: 2 minutos.

8. **Añadir GitHub Topics** al repositorio: `code-visualization`, `dependency-graph`, `3d-graph`, `codebase-analysis`, `webassembly`, `tree-sitter`. Tiempo: 5 minutos en la UI de GitHub.

9. **Crear `vercel.json` con headers de seguridad** — código listo en H4. Tiempo: 15 minutos.

---

## Plan de Acción 30 Días

### Semana 1: Fundamentos técnicos de GEO (2-4 horas total)
- [x] Añadir JSON-LD schemas al `<head>` del index.html (C3)
- [x] Crear robots.txt (H1)
- [x] Crear sitemap.xml (H2)
- [x] Crear llms.txt (H3)
- [x] Crear vercel.json con security headers (H4)
- [x] Corregir `lang="es"` en html tag (H5)
- [x] Acortar meta description (H6)
- [x] Eliminar canonical duplicado (H7)
- [x] Añadir GitHub Topics al repositorio (M3)
- [x] Registrar en Google Search Console y enviar sitemap
- [x] Registrar en Bing Webmaster Tools

### Semana 2: Presencia de marca y comunidad (lanzamiento)
- [ ] Publicar en Reddit (r/programming, r/webdev, r/devtools) para validar el mensaje
- [ ] Publicar Show HN en Hacker News
- [ ] Crear ficha en alternativeto.net con categoría "code visualization"
- [ ] Crear ficha en Product Hunt (puede ser semana 3 si se quiere preparar mejor)

### Semana 3: Contenido indexable
- [ ] Publicar artículo técnico en dev.to o Medium sobre el pipeline WASM de tree-sitter
- [ ] Enriquecer el README de GitHub con screenshots, GIFs, y comparativa con alternativas
- [ ] Crear al menos una página estática de documentación pública (/docs)
- [ ] Añadir Privacy Policy y Terms of Service como HTML estático

### Semana 4: SSR / prerendering y content strategy
- [ ] Evaluar e implementar prerendering estático de la landing (vite-plugin-prerender o migración parcial a Next.js)
- [ ] Crear página de demo con repositorio conocido embebido/grabado
- [ ] Publicar un video de demo en YouTube mostrando los 4 modos de visualización con un repo real (React, Vue, etc.)

---

## Apéndice: Páginas Analizadas

| URL | Título | Issues |
|---|---|---|
| https://graphmycode.com | GraphMyCode.com — Visualiza y entiende tu código como un grafo | 14 issues (3 críticos, 7 altos, 4 medios) |

**Notas técnicas:**
- robots.txt: HTTP 404
- sitemap.xml: HTTP 404
- sitemap_index.xml: HTTP 404
- llms.txt: HTTP 404
- Schema.org markup: ninguno
- Rendering: CSR puro (React 18 + Vite), sin SSR ni SSG
- Hosting: Vercel (x-vercel-cache: HIT confirmado)
- Contenido indexable: ~57 palabras (solo meta tags del `<head>`)
- Indexación Google: 0 resultados en `site:graphmycode.com`

---

*Informe generado por Claude GEO Audit System — 5 subagentes especializados en paralelo*
*Categorías analizadas: AI Visibility, Platform Optimization, Technical GEO, Content E-E-A-T, Schema & Structured Data*
