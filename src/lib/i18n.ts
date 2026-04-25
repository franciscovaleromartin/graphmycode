// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

/**
 * i18n — Internacionalización
 *
 * Detección automática: si el idioma del navegador empieza por "es", se usa español.
 * En cualquier otro caso, inglés.
 */

export type Lang = 'es' | 'en';

export function detectLang(): Lang {
  const lang =
    (typeof navigator !== 'undefined' && (navigator.language || navigator.languages?.[0])) || 'en';
  return lang.startsWith('es') ? 'es' : 'en';
}

const translations = {
  es: {
    // ── Landing ──────────────────────────────────────────────────────────
    tagline: 'Visualiza la arquitectura de tu código al instante',
    by: 'por Francisco Valero',
    tabZip: 'Archivo ZIP',
    tabGithub: 'URL de GitHub',
    dropTitle: 'Arrastra tu proyecto aquí',
    dropSubtitle: 'o haz clic para seleccionar un archivo .zip',
    repoLabel: 'URL del repositorio',
    repoPlaceholder: 'https://github.com/usuario/repositorio',
    analyzeBtn: 'Analizar',
    repoHint: 'Solo repositorios públicos · Máx. 250 archivos fuente',
    errNotZip: 'Por favor sube un archivo .zip',
    errEmptyZip: 'El ZIP no contiene archivos de código fuente reconocibles',
    errInvalidUrl: 'URL inválida. Usa el formato: https://github.com/usuario/repo',
    errDownload: 'Error al descargar el repo',
    errNoFiles: 'No se encontraron archivos de código fuente',
    privacy: 'Tu código nunca sale de tu navegador',
    // Acordeón
    // ── Landing cards ────────────────────────────────────────────────
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
    cardsAiWarning: '⚠️ ¡Ojo! Aquí parte de tu código viajará hacia el proveedor de IA.',

    // ── SidePanel ────────────────────────────────────────────────────────
    statsTitle: 'Stats',
    legendTitle: 'Leyenda',
    statNodes: 'Nodos',
    statFiles: 'Archivos',
    statFunctions: 'Funciones',
    statClasses: 'Clases',
    statEdges: 'Relaciones',
    newAnalysis: 'Nuevo análisis',
    labelFile: 'Archivo',
    labelFolder: 'Carpeta',
    labelClass: 'Clase',
    labelFunction: 'Función',
    labelMethod: 'Método',
    labelInterface: 'Interfaz',
    labelImport: 'Import',

    // ── GraphCanvas ──────────────────────────────────────────────────────
    aiButtonTitle: 'Preguntar a la IA sobre tu código',
    layoutRunning: 'Optimizando layout...',
    clearSelection: 'Limpiar',

    // ── RightPanel ───────────────────────────────────────────────────────
    aiTab: 'AI',
    processesTab: 'Procesos',
    configureAI: 'Configura la IA',
    connecting: 'Conectando',
    askAnything: 'Pregúntame lo que quieras',
    askSubtitle:
      'Puedo ayudarte a entender la arquitectura, encontrar funciones o explicar las conexiones.',
    chatPlaceholder: 'Pregunta sobre el código...',
    clearChat: 'Limpiar',
    youLabel: 'Tú',
    aiLabel: 'AI',
    configureProvider: 'Configura un proveedor de IA para activar el chat.',
    initializingAgent: 'Iniciando agente de IA...',
    suggestions: [
      'Explica la arquitectura del proyecto',
      '¿Qué hace este proyecto?',
      'Muéstrame los archivos más importantes',
      'Encuentra todos los API handlers',
    ],

    aiPrivacyWarning: 'Con la IA activada, fragmentos de tu código se envían al proveedor elegido fuera de tu navegador.',

    // ── SettingsPanel ────────────────────────────────────────────────────
    settingsTitle: 'Configuración de IA',
    settingsSubtitle: 'Configura tu proveedor LLM',
    providerLabel: 'Proveedor',
    sessionWarning:
      'Las API keys se guardan en sessionStorage y se borran al cerrar esta pestaña.',
    saveBtn: 'Guardar',
    savedMsg: '¡Guardado!',
    cancelBtn: 'Cancelar',
    baseUrlLabel: 'URL base',
    baseUrlOptional: '(opcional)',
    baseUrlHint:
      'Déjalo vacío para usar la API por defecto. Ponlo para proxies o APIs compatibles.',
    connected: 'Conectado',
    notConnected: 'No conectado',

    // ── Stats chips ──────────────────────────────────────────────────
    statsRow: ['12 lenguajes', 'hasta 250 archivos', '0 servidores', '4 vistas'],

    // ── FAQ ──────────────────────────────────────────────────────────
    faqTitle: 'Preguntas frecuentes',
    faq1Q: '¿Qué es GraphMyCode?',
    faq1A: 'GraphMyCode convierte cualquier repositorio en un grafo interactivo de dependencias que se ejecuta completamente en tu navegador. Sin instalación, sin servidor, sin cuenta. Analiza hasta 250 archivos fuente de 12 lenguajes de programación.',
    faq2Q: '¿Cómo funciona?',
    faq2A: 'Sube un .zip de tu proyecto o pega una URL de GitHub público. GraphMyCode parsea el código con tree-sitter (WebAssembly), construye un grafo de símbolos y dependencias en memoria y lo renderiza de forma interactiva. Tu código nunca abandona el navegador.',
    faq3Q: '¿Qué lenguajes de programación soporta?',
    faq3A: 'JavaScript, TypeScript, Python, Java, Go, Rust, C, C++, C#, PHP, Ruby y Swift. Hasta 250 archivos fuente por repositorio.',
    faq4Q: '¿Es gratuito?',
    faq4A: 'Sí. GraphMyCode es de código abierto bajo la licencia PolyForm Noncommercial 1.0. Gratuito para uso personal, educativo y no comercial.',

    // ── Footer ───────────────────────────────────────────────────────
    footerPrivacy: 'Política de privacidad',
    footerHowItWorks: 'Cómo funciona',
    footerUseCases: 'Casos de uso',
    footerLicense: 'Licencia PolyForm',
    footerRights: '© 2026 Francisco Valero',
    footerUpdated: 'Actualizado: abril 2026',
  },

  en: {
    // ── Landing ──────────────────────────────────────────────────────────
    tagline: 'Visualize your code architecture instantly',
    by: 'by Francisco Valero',
    tabZip: 'ZIP File',
    tabGithub: 'GitHub URL',
    dropTitle: 'Drop your project here',
    dropSubtitle: 'or click to select a .zip file',
    repoLabel: 'Repository URL',
    repoPlaceholder: 'https://github.com/user/repository',
    analyzeBtn: 'Analyze',
    repoHint: 'Public repositories only · Max. 250 source files',
    errNotZip: 'Please upload a .zip file',
    errEmptyZip: 'The ZIP contains no recognizable source files',
    errInvalidUrl: 'Invalid URL. Use the format: https://github.com/user/repo',
    errDownload: 'Error downloading the repository',
    errNoFiles: 'No source files found',
    privacy: 'Your code never leaves your browser',
    // ── Landing cards ────────────────────────────────────────────────
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
    cardsAiWarning: '⚠️ Heads up! Part of your code will travel to the AI provider.',

    // ── SidePanel ────────────────────────────────────────────────────────
    statsTitle: 'Stats',
    legendTitle: 'Legend',
    statNodes: 'Nodes',
    statFiles: 'Files',
    statFunctions: 'Functions',
    statClasses: 'Classes',
    statEdges: 'Relationships',
    newAnalysis: 'New analysis',
    labelFile: 'File',
    labelFolder: 'Folder',
    labelClass: 'Class',
    labelFunction: 'Function',
    labelMethod: 'Method',
    labelInterface: 'Interface',
    labelImport: 'Import',

    // ── GraphCanvas ──────────────────────────────────────────────────────
    aiButtonTitle: 'Ask AI about your code',
    layoutRunning: 'Layout optimizing...',
    clearSelection: 'Clear',

    // ── RightPanel ───────────────────────────────────────────────────────
    aiTab: 'AI',
    processesTab: 'Processes',
    configureAI: 'Configure AI',
    connecting: 'Connecting',
    askAnything: 'Ask me anything',
    askSubtitle: 'I can help you understand the architecture, find functions, or explain connections.',
    chatPlaceholder: 'Ask about the codebase...',
    clearChat: 'Clear',
    youLabel: 'You',
    aiLabel: 'AI',
    configureProvider: 'Configure an LLM provider to enable chat.',
    initializingAgent: 'Initializing AI agent...',
    suggestions: [
      'Explain the project architecture',
      'What does this project do?',
      'Show me the most important files',
      'Find all API handlers',
    ],

    aiPrivacyWarning: 'With AI enabled, parts of your code are sent to your chosen provider outside your browser.',

    // ── SettingsPanel ────────────────────────────────────────────────────
    settingsTitle: 'AI Settings',
    settingsSubtitle: 'Configure your LLM provider',
    providerLabel: 'Provider',
    sessionWarning: 'API keys are stored in session storage and will be cleared when you close this tab.',
    saveBtn: 'Save',
    savedMsg: 'Saved!',
    cancelBtn: 'Cancel',
    baseUrlLabel: 'Base URL',
    baseUrlOptional: '(optional)',
    baseUrlHint: 'Leave empty to use the default API. Set a custom URL for proxies or compatible APIs.',
    connected: 'Connected',
    notConnected: 'Not connected',

    // ── Stats chips ──────────────────────────────────────────────────
    statsRow: ['12 languages', 'up to 250 files', '0 servers', '4 views'],

    // ── FAQ ──────────────────────────────────────────────────────────
    faqTitle: 'Frequently asked questions',
    faq1Q: 'What is GraphMyCode?',
    faq1A: 'GraphMyCode converts any code repository into an interactive dependency graph running entirely in your browser. No installation, no server, no account required. Analyzes up to 250 source files across 12 programming languages.',
    faq2Q: 'How does it work?',
    faq2A: 'Upload a .zip of your project or paste a public GitHub URL. GraphMyCode parses your code with tree-sitter (WebAssembly), builds a symbol and dependency graph in memory, and renders it interactively. Your code never leaves your browser.',
    faq3Q: 'Which programming languages are supported?',
    faq3A: 'JavaScript, TypeScript, Python, Java, Go, Rust, C, C++, C#, PHP, Ruby, and Swift. Up to 250 source files per repository.',
    faq4Q: 'Is it free?',
    faq4A: 'Yes. GraphMyCode is open source under the PolyForm Noncommercial 1.0 license. Free for personal, educational, and non-commercial use.',

    // ── Footer ───────────────────────────────────────────────────────
    footerPrivacy: 'Privacy policy',
    footerHowItWorks: 'How it works',
    footerUseCases: 'Use cases',
    footerLicense: 'PolyForm License',
    footerRights: '© 2026 Francisco Valero',
    footerUpdated: 'Updated: April 2026',
  },
};

export type Translations = typeof translations.en;

/** Hook que devuelve el objeto de traducciones para el idioma detectado */
export function useT(): Translations {
  const lang = detectLang();
  return translations[lang] as Translations;
}
