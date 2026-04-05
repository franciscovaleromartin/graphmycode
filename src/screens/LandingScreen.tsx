import { useState, useRef, useCallback } from 'react';
import * as Comlink from 'comlink';
import { useAppState } from '../hooks/useAppState';
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

// ── Explicación Accordion ─────────────────────────────────────────────────────

const ExplicacionAccordion = () => {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-6 rounded-2xl border border-border-subtle bg-surface overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
      >
        <span>Explicación</span>
        <svg
          className={`h-4 w-4 text-text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-border-subtle px-5 pb-5 pt-4 space-y-4 text-sm text-text-secondary">
          <div>
            <p className="mb-1 font-medium text-text-primary">¿Qué problema resuelve?</p>
            <p>Cuando entras a un repositorio nuevo o grande, entender cómo están conectados los módulos es lento leyendo carpeta a carpeta. GraphMyCode te da esa visión global en segundos: archivos, clases, funciones, imports, llamadas entre funciones y clusters de código relacionado, todo como un grafo interactivo.</p>
          </div>

          <div>
            <p className="mb-1 font-medium text-text-primary">¿Hay algún servidor o base de datos externa?</p>
            <p>No. Todo corre en tu navegador, en memoria. No hay cluster de Neo4j, no hay backend, no hay red. El Cypher que usa el agente es un lenguaje de consulta sobre el grafo local. <a href="https://github.com/franciscovaleromartin/graphmycode" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Visible en el repositorio</a>.</p>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Component ─────────────────────────────────────────────────────────────────

type InputMode = 'zip' | 'github';

export const LandingScreen = () => {
  const { setGraph, setViewMode, setProgress, setProjectName } = useAppState();

  const [mode, setMode] = useState<InputMode>('zip');
  const [githubUrl, setGithubUrl] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        setProgress(null);
        setViewMode('exploring');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error desconocido';
        setError(msg);
        setProgress(null);
        setViewMode('onboarding');
      } finally {
        setIsProcessing(false);
      }
    },
    [setGraph, setViewMode, setProgress, setProjectName],
  );

  const handleFiles = useCallback(
    async (fileList: FileList) => {
      const file = fileList[0];
      if (!file?.name.endsWith('.zip')) {
        setError('Por favor sube un archivo .zip');
        return;
      }
      const entries = await extractZip(file);
      if (entries.length === 0) {
        setError('El ZIP no contiene archivos de código fuente reconocibles');
        return;
      }
      await runPipeline(entries, file.name.replace(/\.zip$/i, ''));
    },
    [runPipeline],
  );

  const handleGitHub = useCallback(async () => {
    const parsed = parseGitHubUrl(githubUrl);
    if (!parsed) {
      setError('URL inválida. Usa el formato: https://github.com/usuario/repo');
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
      setError(err instanceof Error ? err.message : 'Error al descargar el repo');
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-void px-6">
      {/* Ambient glows */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-accent/8 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 h-64 w-64 rounded-full bg-node-function/6 blur-3xl" />
      </div>

      <div className="relative w-full max-w-xl">
        {/* Header */}
        <div className="mb-10 text-center">
          <h1 className="mb-1 text-4xl font-semibold tracking-tight text-text-primary">
            GraphMy<span className="text-cyan-400">Code</span>
          </h1>
          <p className="mb-2 text-xs text-text-muted">por Francisco Valero</p>
          <p className="text-sm text-text-secondary">
            Visualiza la arquitectura de tu código al instante
          </p>
        </div>

        {/* Tab switcher */}
        <div className="mb-4 flex rounded-xl border border-border-subtle bg-surface p-1">
          {(['zip', 'github'] as InputMode[]).map((tab) => (
            <button
              key={tab}
              onClick={() => { setMode(tab); setError(null); }}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                mode === tab
                  ? 'bg-accent/15 text-accent'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              {tab === 'zip' ? 'Archivo ZIP' : 'URL de GitHub'}
            </button>
          ))}
        </div>

        {/* ZIP drop zone */}
        {mode === 'zip' && (
          <div
            className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed py-14 transition-all ${
              isDragging
                ? 'border-accent bg-accent/8 scale-[1.01]'
                : 'border-border-default bg-surface hover:border-accent/50 hover:bg-elevated'
            }`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <svg
              className={`mb-4 h-10 w-10 transition-colors ${isDragging ? 'text-accent' : 'text-text-muted'}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
              />
            </svg>
            <p className="mb-1 text-sm font-medium text-text-primary">
              Arrastra tu proyecto aquí
            </p>
            <p className="text-xs text-text-muted">o haz clic para seleccionar un archivo .zip</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
            />
          </div>
        )}

        {/* GitHub URL input */}
        {mode === 'github' && (
          <div className="rounded-2xl border border-border-default bg-surface p-6">
            <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-text-muted">
              URL del repositorio
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="https://github.com/usuario/repositorio"
                disabled={isProcessing}
                className="flex-1 rounded-xl border border-border-default bg-elevated px-4 py-2.5 text-sm text-text-primary placeholder-text-muted outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent/30 disabled:opacity-50"
              />
              <button
                onClick={handleGitHub}
                disabled={isProcessing || !githubUrl.trim()}
                className="rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-void transition-all hover:bg-accent-dim disabled:cursor-not-allowed disabled:opacity-40"
              >
                Analizar
              </button>
            </div>
            <p className="mt-3 text-xs text-text-muted">
              Solo repositorios públicos · Máx. 250 archivos fuente
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/8 px-4 py-3 text-center text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Explicación desplegable */}
        <ExplicacionAccordion />

        {/* Privacy badge */}
        <p className="mt-6 text-center text-xs text-text-muted">
          <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-node-function align-middle" />
          Tu código nunca sale de tu navegador
        </p>
      </div>
    </div>
  );
};
