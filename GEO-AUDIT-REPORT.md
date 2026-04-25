# GEO Audit Report — graphmycode.com

**Fecha:** 2026-04-25
**URL:** https://graphmycode.com
**Tipo de negocio:** Developer Tool / SaaS (open source, gratuito)
**Auditado por:** GraphMyCode GEO Audit (5 subagentes paralelos)

---

## GEO Score Compuesto: 23/100 — Crítico

| Categoría | Peso | Puntuación | Ponderado |
|---|---|---|---|
| AI Citability & Visibility | 25% | 22/100 | 5.50 |
| Brand Authority Signals | 20% | 8/100 | 1.60 |
| Content Quality & E-E-A-T | 20% | 38/100 | 7.60 |
| Technical Foundations | 15% | 41/100 | 6.15 |
| Structured Data | 10% | 5/100 | 0.50 |
| Platform Optimization | 10% | 16/100 | 1.60 |
| **TOTAL** | **100%** | | **23/100** |

### Puntuaciones por plataforma AI

| Plataforma | Score | Estado |
|---|---|---|
| Google AI Overviews | 18/100 | Crítico |
| ChatGPT Web Search | 14/100 | Crítico |
| Perplexity AI | 15/100 | Crítico |
| Google Gemini | 16/100 | Crítico |
| Bing Copilot | 17/100 | Crítico |

---

## Diagnóstico raíz

GraphMyCode es una SPA React con Client-Side Rendering puro. Cuando cualquier crawler de IA (GPTBot, ClaudeBot, PerplexityBot, Googlebot) accede al sitio, recibe:

```html
<body>
  <div id="root"></div>
</body>
```

El H1, el tagline, las tarjetas de funcionalidades, los CTAs — nada de esto existe en el HTML que los crawlers analizan. Este único problema pone un techo práctico de ~25 puntos en todas las categorías hasta que se resuelva. **Es el bloqueo más crítico de toda la auditoría.**

---

## Quick Wins — Ya implementados ✅

Los siguientes cambios han sido aplicados en este deploy:

| Archivo | Cambio | Impacto |
|---|---|---|
| `public/robots.txt` | Creado — declara todos los crawlers de IA explícitamente | AI Visibility, Technical |
| `public/sitemap.xml` | Creado — URL canónica del sitio | Crawlability, Technical |
| `public/llms.txt` | Creado — descripción completa para modelos de IA | AI Visibility, ChatGPT, Perplexity |
| `index.html` | JSON-LD `@graph` añadido (SoftwareApplication + Person + WebSite) | Schema +73 pts |
| `index.html` | Meta description recortada a ~155 chars | Technical |
| `index.html` | `<meta name="robots">` con max-snippet:-1 | Google AI Overviews |
| `vercel.json` | Redirect www→non-www 301 permanente (fix conflicto canonical) | Technical |
| `vercel.json` | Cache inmutable para `/assets/.*` (JS y CSS content-hashed) | Core Web Vitals |
| `vercel.json` | Headers de seguridad: X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy | Security |

**Score proyectado tras este deploy: ~38/100** (mejora de +15 puntos)

---

## Hallazgos detallados

### 1. AI Visibility — 22/100

#### Citabilidad (38/100 condicional)
El contenido es potencialmente citable pero invisible por el CSR. Pasajes más fuertes si fueran indexables:

| Pasaje | Score | Razón |
|---|---|---|
| "Everything runs in your browser, in memory. No telemetry, no personal data." | 74/100 | Responde directamente "¿es seguro mi código?" |
| Technical Debt City — edificio = deuda | 71/100 | Metáfora distintiva y autoexplicativa |
| Tagline: "Visualize your code architecture instantly" | 65/100 | Limpio pero sin datos cuantitativos |
| Dependency Heatmap — detección de ciclos | 60/100 | Técnicamente específico |

#### Crawlers AI
- ❌ SPA sin SSR — contenido invisible a todos los crawlers
- ✅ robots.txt creado con declaración explícita de bots
- ✅ llms.txt creado
- ✅ sitemap.xml creado

#### Menciones de marca — 8/100
| Plataforma | Estado |
|---|---|
| GitHub | ✅ Presente (1 estrella, 0 forks — bajo) |
| LinkedIn company | ❌ No existe página de empresa |
| Wikipedia | ❌ Sin artículo |
| Reddit | ❌ Sin menciones verificadas |
| YouTube | ❌ Sin canal ni demos |
| Product Hunt | ❌ Sin listing |
| Hacker News | ❌ Sin Show HN |
| dev.to / DEV Community | ❌ Sin posts |
| AlternativeTo | ❌ Sin listing |

---

### 2. Platform Analysis — 16/100

**Barrera común a todas las plataformas:** SPA/CSR sin HTML renderizado.

| Plataforma | Barrera principal | Acción prioritaria |
|---|---|---|
| Google AI Overviews | Sin headings de pregunta-respuesta, sin SSR | Pre-render + H2 en formato "¿Qué es GraphMyCode?" |
| ChatGPT Web Search | Sin entidad en Wikipedia/Wikidata, sin schema sameAs | JSON-LD sameAs + Product Hunt |
| Perplexity AI | Sin validación comunitaria (Reddit, HN) | Show HN + r/webdev post |
| Google Gemini | Sin YouTube, sin páginas de contenido | Video demo + /how-it-works |
| Bing Copilot | Sin IndexNow, sin sitemap activo | IndexNow en Vercel + LinkedIn company page |

---

### 3. Technical SEO — 41/100

#### Crítico
- **CSR puro** — body = `<div id="root">` vacío en el HTML inicial
- **Conflicto canonical/redirect** — `https://graphmycode.com` (canonical) vs `https://www.graphmycode.com/` (redirect 307) — **CORREGIDO: 301 permanente a non-www**
- **Assets JS/CSS sin caché inmutable** — 314 KB revalidados en cada visita — **CORREGIDO: max-age=31536000, immutable**

#### Alto
- ❌ Sin hreflang (contenido bilingüe ES/EN sin declaración)
- ❌ `lang="en"` en HTML pero meta description en español (inconsistencia)
- ❌ OG image pesa 870 KB (recomendado: <200 KB)

#### Implementado ✅
- ✅ robots.txt con Sitemap reference
- ✅ sitemap.xml
- ✅ llms.txt
- ✅ Headers de seguridad: X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy
- ✅ meta description recortada a ~155 chars
- ✅ max-snippet meta robots

#### Puntuación de seguridad (antes → después)
| Header | Antes | Después |
|---|---|---|
| COOP | ✅ same-origin | ✅ same-origin |
| COEP | ✅ credentialless | ✅ credentialless |
| X-Content-Type-Options | ❌ | ✅ nosniff |
| X-Frame-Options | ❌ | ✅ SAMEORIGIN |
| Referrer-Policy | ❌ | ✅ strict-origin-when-cross-origin |
| Permissions-Policy | ❌ | ✅ camera=(), microphone=(), geolocation=() |
| CSP | ❌ | ❌ (pendiente — complejo con WASM) |

---

### 4. Content Quality & E-E-A-T — 38/100

| Dimensión | Score | Principales gaps |
|---|---|---|
| Experience | 14/25 | Sin "por qué lo construí", sin casos reales |
| Expertise | 16/25 | Autor identificado, pero sin artículos técnicos ni credenciales on-page |
| Authoritativeness | 10/25 | Solo GitHub como presencia externa; sin citas de terceros |
| Trustworthiness | 11/25 | Sin privacy policy page, sin contacto, sin fechas visibles |

**Métricas de contenido:**
- Palabras en el sitio: ~400 (muy escaso para "code visualization tool")
- Páginas crawlables: 1 (SPA)
- Blog/docs: ❌ No existe
- Comparativas: ❌ No existen
- FAQ: ❌ No existe

---

### 5. Schema Markup — 5/100 → ~78/100 tras deploy ✅

**Antes:** Zero structured data
**Después (implementado):** `@graph` con tres entidades:

```
SoftwareApplication (@id: #software)
  ├── name: GraphMyCode
  ├── applicationCategory: DeveloperApplication
  ├── isAccessibleForFree: true
  ├── offers: { price: 0 }
  ├── programmingLanguage: [12 lenguajes]
  ├── featureList: [8 features]
  ├── codeRepository: github.com/...
  └── author → Person (#author)

Person (@id: #author)
  ├── name: Francisco Alejandro Valero Martin
  ├── jobTitle: Software Developer
  ├── knowsAbout: [9 skills]
  └── sameAs: [LinkedIn, GitHub, personal site]

WebSite (@id: #website)
  ├── name: GraphMyCode
  ├── inLanguage: [es, en]
  └── publisher → Person (#author)
```

**Gap restante:** `sameAs` en SoftwareApplication solo apunta a GitHub. Cuando existan listings en Product Hunt, AlternativeTo, o Crunchbase, añadirlos aquí.

---

## Plan de acción priorizado

### Crítico — Hacer en los próximos 7 días

| # | Acción | Esfuerzo | Impacto GEO |
|---|---|---|---|
| C1 | **Pre-renderizar la landing page** — instalar `vite-ssg` o `vite-plugin-prerender` para que `/` genere HTML estático con todo el contenido visible | 4-8h | +25-35 pts |
| C2 | **Añadir H2 con preguntas-respuesta** en la landing — "¿Qué es GraphMyCode?", "¿Cómo funciona?", "¿Qué lenguajes soporta?" — cada una con 40-60 palabras (requiere C1 primero) | 1h | +8 pts |

### Alto — Próximas 2-4 semanas

| # | Acción | Esfuerzo | Impacto GEO |
|---|---|---|---|
| A1 | **Publicar Show HN** en Hacker News — herramienta in-browser con WASM + semantic clustering 3D es genuinamente novedosa | 2h | +12 pts brand |
| A2 | **Crear listing en Product Hunt** — screenshots, tagline, descripción completa | 2h | +8 pts brand |
| A3 | **Crear video demo en YouTube** (2-5 min) con repositorio real — "¿Cómo visualizar la arquitectura de tu código?" | 3-4h | +6 pts Gemini |
| A4 | **Crear página de Privacy Policy** en `/privacy` — convierte la claim "sin servidor" en documento legal formal | 1h | +4 pts trust |
| A5 | **Comprimir og-image.png** de 870 KB a <200 KB — WebP 1200x630 | 30min | LCP + social |
| A6 | **Implementar IndexNow en Vercel** — notificación automática a Bing en cada deploy | 30min | +3 pts Bing |

### Medio — Próximo mes

| # | Acción | Esfuerzo | Impacto GEO |
|---|---|---|---|
| M1 | **Añadir datos cuantitativos** al landing: "analiza 10.000 archivos en menos de 30s", "soporta 12 lenguajes", "0 peticiones al servidor" | 30min | +5 pts citabilidad |
| M2 | **Artículo técnico en dev.to** — "Cómo construí un grafo de dependencias con tree-sitter WASM y Sigma.js" | 4-6h | +10 pts authority |
| M3 | **Página `/how-it-works`** con explicación técnica del pipeline WASM | 3-4h | +8 pts Gemini+AIO |
| M4 | **Página `/use-cases`** — onboarding, code review, refactoring, technical debt | 2-3h | +6 pts topical |
| M5 | **Listing en AlternativeTo** y directorios open source | 1h | +5 pts brand |
| M6 | **LinkedIn company page** para GraphMyCode | 30min | +3 pts entity |
| M7 | **Añadir fecha de última actualización** visible en footer y `<time datetime>` | 30min | +2 pts freshness |
| M8 | **hreflang** para ES/EN | 1h | Technical |

### Estratégico — Largo plazo

| # | Acción | Impacto |
|---|---|---|
| S1 | Artículo de Wikipedia sobre GraphMyCode (requiere notoriedad previa) | Máximo impacto en entity graph |
| S2 | Testimonios de usuarios en landing | Social proof + E-E-A-T |
| S3 | Changelog público visible | Freshness + trust |
| S4 | CSP (Content Security Policy) completo | Security score |

---

## Score proyectado tras cada fase

| Fase | Cambios | GEO Score estimado |
|---|---|---|
| Baseline | Estado actual | 23/100 |
| ✅ Quick wins (implementados) | robots.txt, sitemap, llms.txt, JSON-LD, security headers, cache fix | ~38/100 |
| + SSR (C1+C2) | Pre-render + H2 preguntas | ~52/100 |
| + Brand (A1-A6) | HN + Product Hunt + YouTube + Privacy | ~62/100 |
| + Content (M1-M7) | Artículos + páginas + datos cuantitativos | ~72/100 |
| + Estratégico (S1-S4) | Wikipedia + testimonios + changelog | ~80/100 |

---

## Archivos generados

| Archivo | Descripción |
|---|---|
| `public/robots.txt` | Crawlers permitidos explícitamente, incluyendo todos los bots de IA |
| `public/sitemap.xml` | Sitemap con URL canónica |
| `public/llms.txt` | Descripción estructurada para modelos de lenguaje |
| `index.html` | JSON-LD @graph añadido, meta description corregida, max-snippet |
| `vercel.json` | Redirect 301 www→non-www, cache inmutable assets, headers de seguridad |
| `GEO-AUDIT-REPORT.md` | Este informe |

---

*Auditoría generada el 2026-04-25 mediante 5 subagentes GEO paralelos (geo-ai-visibility, geo-platform-analysis, geo-technical, geo-content, geo-schema)*
