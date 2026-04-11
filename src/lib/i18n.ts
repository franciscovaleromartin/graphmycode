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
    accordionTitle: 'Sobre la privacidad de tu código',
    accordionQ1: '¿Qué problema resuelve?',
    accordionA1:
      'Cuando entras a un repositorio nuevo o grande, entender cómo están conectados los módulos es lento leyendo carpeta a carpeta. GraphMyCode te da esa visión global en segundos: archivos, clases, funciones, imports, llamadas entre funciones y clusters de código relacionado, todo como un grafo interactivo.\n\nLa nueva vista semántica 3D va un paso más allá: agrupa los nodos por similitud de código usando embeddings, lo que permite identificar abstracciones de dominio (componentes que resuelven el mismo problema aunque no se llamen entre sí), detectar acoplamiento lógico entre módulos aparentemente independientes, analizar el impacto real de un cambio más allá de las dependencias directas, y apoyar la gobernanza de metadatos al revelar qué partes del código comparten semántica aunque estén separadas estructuralmente.',
    accordionQ2: '¿Hay algún servidor o base de datos externa?',
    accordionA2:
      'No. Todo corre en tu navegador, en memoria. No hay cluster de Neo4j, no hay backend, no hay red. El Cypher que usa el agente es un lenguaje de consulta sobre el grafo local.',
    accordionQ3: '¿Se almacena tu código o algún dato tuyo?',
    accordionA3:
      'No. GraphMyCode no tiene base de datos, no tiene servidor propio y no guarda ningún archivo. Todo el análisis ocurre en memoria dentro de tu navegador y desaparece en cuanto cierras la pestaña. Tampoco se recogen métricas de uso ni se registra ningún dato personal.',
    accordionQ4: '¿Puedo hacer preguntas sobre mi código?',
    accordionOptional: 'Opcional',
    accordionA4:
      'Sí. Una vez cargado el grafo, el botón AI Question te permite conectar tu propio proveedor de IA (OpenAI, Gemini, Anthropic, Ollama u otros) y hacerle preguntas en lenguaje natural sobre tu código. Tú pones tu API key, que se guarda solo en tu navegador. Ten en cuenta que al activar esta opción, fragmentos de tu código sí viajarán fuera del navegador hacia el proveedor de IA que hayas elegido. Si usas Ollama (local), el código no sale de tu máquina.',

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
    // Accordion
    accordionTitle: 'About your code privacy',
    accordionQ1: 'What problem does it solve?',
    accordionA1:
      'When you open a new or large repository, understanding how modules connect is slow when reading folder by folder. GraphMyCode gives you that global view in seconds: files, classes, functions, imports, call chains, and clusters of related code — all as an interactive graph.\n\nThe new 3D semantic view goes further: it groups nodes by code similarity using embeddings, helping you identify domain abstractions (components solving the same problem even if they never call each other), detect logical coupling between apparently independent modules, analyse the real impact of a change beyond direct dependencies, and support metadata governance by revealing which parts of the codebase share semantics even when structurally apart.',
    accordionQ2: 'Is there any external server or database?',
    accordionA2:
      'No. Everything runs in your browser, in memory. There is no Neo4j cluster, no backend, no network. The Cypher used by the agent is a query language over the local in-memory graph.',
    accordionQ3: 'Is your code or any of your data stored?',
    accordionA3:
      'No. GraphMyCode has no database, no backend server, and saves no files. All analysis runs in memory inside your browser and disappears as soon as you close the tab. No usage metrics are collected and no personal data is recorded.',
    accordionQ4: 'Can I ask questions about my code?',
    accordionOptional: 'Optional',
    accordionA4:
      'Yes. Once the graph is loaded, the AI Question button lets you connect your own AI provider (OpenAI, Gemini, Anthropic, Ollama, and others) and ask questions in natural language about your code. You provide your API key, stored only in your browser. However, be aware that when this option is enabled, parts of your code will be sent outside your browser to the AI provider you have chosen. If you use Ollama (local), your code never leaves your machine.',

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
  },
};

export type Translations = typeof translations.en;

/** Hook que devuelve el objeto de traducciones para el idioma detectado */
export function useT(): Translations {
  const lang = detectLang();
  return translations[lang] as Translations;
}
