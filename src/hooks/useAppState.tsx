// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  ReactNode,
} from 'react';
import type { GraphNode, NodeLabel, PipelineProgress } from 'gitnexus-shared';
import type { KnowledgeGraph } from '../core/graph/types';
import { createKnowledgeGraph } from '../core/graph/graph';
import type { LLMSettings, ChatMessage, ToolCallInfo } from '../core/llm/types';
import { getActiveProviderConfig } from '../core/llm/settings-service';
import type { SemanticClusterEntry } from '../core/llm/context-builder';
import { type EdgeType } from '../lib/constants';
import {
  connectToServer,
  runQuery as backendRunQuery,
  probeBackend,
  type BackendRepo,
  type ConnectResult,
} from '../services/backend-client';
import { ERROR_RESET_DELAY_MS } from '../config/ui-constants';
import { normalizePath } from '../lib/path-resolution';
import { GraphStateProvider, useGraphState } from './app-state/graph';
import { useHighlights } from './app-state/useHighlights';
import { useEmbedding } from './app-state/useEmbedding';
import { useCodeReferences } from './app-state/useCodeReferences';
import { useChatAgent } from './app-state/useChatAgent';

// Re-export types used by consumers
export type { AnimationType, NodeAnimation } from './app-state/useHighlights';
export type { EmbeddingStatus } from './app-state/useEmbedding';
export type { CodeReference, CodeReferenceFocus } from './app-state/useCodeReferences';

export type ViewMode = 'onboarding' | 'loading' | 'exploring';
export type RightPanelTab = 'code' | 'chat';

export interface QueryResult {
  rows: Record<string, any>[];
  nodeIds: string[];
  executionTime: number;
}

import type { AnimationType, NodeAnimation } from './app-state/useHighlights';
import type { EmbeddingStatus } from './app-state/useEmbedding';
import type { CodeReference, CodeReferenceFocus } from './app-state/useCodeReferences';

interface AppState {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;

  graph: KnowledgeGraph | null;
  setGraph: (graph: KnowledgeGraph | null) => void;

  selectedNode: GraphNode | null;
  setSelectedNode: (node: GraphNode | null) => void;

  isRightPanelOpen: boolean;
  setRightPanelOpen: (open: boolean) => void;
  rightPanelTab: RightPanelTab;
  setRightPanelTab: (tab: RightPanelTab) => void;
  openCodePanel: () => void;
  openChatPanel: () => void;
  helpDialogBoxOpen: boolean;
  setHelpDialogBoxOpen: (open: boolean) => void;

  visibleLabels: NodeLabel[];
  toggleLabelVisibility: (label: NodeLabel) => void;
  visibleEdgeTypes: EdgeType[];
  toggleEdgeVisibility: (edgeType: EdgeType) => void;

  depthFilter: number | null;
  setDepthFilter: (depth: number | null) => void;

  highlightedNodeIds: Set<string>;
  setHighlightedNodeIds: (ids: Set<string>) => void;

  aiCitationHighlightedNodeIds: Set<string>;
  aiToolHighlightedNodeIds: Set<string>;
  blastRadiusNodeIds: Set<string>;
  isAIHighlightsEnabled: boolean;
  toggleAIHighlights: () => void;
  clearAIToolHighlights: () => void;
  clearAICitationHighlights: () => void;
  clearBlastRadius: () => void;
  queryResult: QueryResult | null;
  setQueryResult: (result: QueryResult | null) => void;
  clearQueryHighlights: () => void;

  animatedNodes: Map<string, NodeAnimation>;
  triggerNodeAnimation: (nodeIds: string[], type: AnimationType) => void;
  clearAnimations: () => void;

  progress: PipelineProgress | null;
  setProgress: (progress: PipelineProgress | null) => void;

  projectName: string;
  setProjectName: (name: string) => void;

  serverBaseUrl: string | null;
  setServerBaseUrl: (url: string | null) => void;
  availableRepos: BackendRepo[];
  setAvailableRepos: (repos: BackendRepo[]) => void;
  switchRepo: (repoName: string) => Promise<void>;

  runQuery: (cypher: string) => Promise<any[]>;
  isDatabaseReady: () => Promise<boolean>;

  embeddingStatus: EmbeddingStatus;
  embeddingProgress: { phase: string; percent: number } | null;
  startEmbeddings: () => Promise<void>;
  startEmbeddingsWithFallback: () => void;
  semanticSearch: (query: string, k?: number) => Promise<any[]>;
  semanticSearchWithContext: (query: string, k?: number, hops?: number) => Promise<any[]>;
  isEmbeddingReady: boolean;

  llmSettings: LLMSettings;
  updateLLMSettings: (updates: Partial<LLMSettings>) => void;
  isSettingsPanelOpen: boolean;
  setSettingsPanelOpen: (open: boolean) => void;
  isSidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  graphViewType: 'structural' | 'semantic' | 'city' | 'heatmap' | 'codeflow' | 'architectural';
  setGraphViewType: (v: 'structural' | 'semantic' | 'city' | 'heatmap' | 'codeflow' | 'architectural') => void;
  cityMetric: 'degree' | 'depth';
  setCityMetric: (v: 'degree' | 'depth') => void;
  externalDeps: Record<string, string[]>;
  setExternalDeps: (deps: Record<string, string[]>) => void;
  semanticClusterData: SemanticClusterEntry[] | null;
  setSemanticClusterData: (data: SemanticClusterEntry[] | null) => void;
  isAgentReady: boolean;
  isAgentInitializing: boolean;
  agentError: string | null;

  chatMessages: ChatMessage[];
  isChatLoading: boolean;
  currentToolCalls: ToolCallInfo[];

  refreshLLMSettings: () => void;
  initializeAgent: (overrideProjectName?: string) => Promise<void>;
  sendChatMessage: (message: string) => Promise<void>;
  stopChatResponse: () => void;
  clearChat: () => void;

  codeReferences: CodeReference[];
  isCodePanelOpen: boolean;
  setCodePanelOpen: (open: boolean) => void;
  addCodeReference: (ref: Omit<CodeReference, 'id'>) => void;
  removeCodeReference: (id: string) => void;
  clearAICodeReferences: () => void;
  clearCodeReferences: () => void;
  codeReferenceFocus: CodeReferenceFocus | null;
}

const AppStateContext = createContext<AppState | null>(null);

export const AppStateProvider = ({ children }: { children: ReactNode }) => (
  <GraphStateProvider>
    <AppStateProviderInner>{children}</AppStateProviderInner>
  </GraphStateProvider>
);

const AppStateProviderInner = ({ children }: { children: ReactNode }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('onboarding');

  const {
    graph,
    setGraph,
    selectedNode,
    setSelectedNode,
    visibleLabels,
    toggleLabelVisibility,
    visibleEdgeTypes,
    toggleEdgeVisibility,
    depthFilter,
    setDepthFilter,
    highlightedNodeIds,
    setHighlightedNodeIds,
  } = useGraphState();

  const [isRightPanelOpen, setRightPanelOpen] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>('code');
  const [helpDialogBoxOpen, setHelpDialogBoxOpen] = useState(false);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [progress, setProgress] = useState<PipelineProgress | null>(null);
  const [projectName, setProjectName] = useState<string>('');
  const [serverBaseUrl, setServerBaseUrl] = useState<string | null>(null);
  const [availableRepos, setAvailableRepos] = useState<BackendRepo[]>([]);
  const [isSettingsPanelOpen, setSettingsPanelOpen] = useState(false);
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [graphViewType, setGraphViewType] = useState<
    'structural' | 'semantic' | 'city' | 'heatmap' | 'codeflow' | 'architectural'
  >('structural');
  const [cityMetric, setCityMetric] = useState<'degree' | 'depth'>('degree');
  const [externalDeps, setExternalDeps] = useState<Record<string, string[]>>({});
  const [semanticClusterData, setSemanticClusterData] = useState<SemanticClusterEntry[] | null>(
    null,
  );

  const repoRef = useRef<string | undefined>(undefined);

  // ── Extracted hooks ────────────────────────────────────────────────────────

  const highlights = useHighlights();

  const embedding = useEmbedding(repoRef);

  // File lookups derived from graph
  const fileNodeByPath = useMemo(() => {
    if (!graph) return new Map<string, string>();
    const map = new Map<string, string>();
    for (const n of graph.nodes) {
      if (n.label === 'File') map.set(normalizePath(n.properties.filePath), n.id);
    }
    return map;
  }, [graph]);

  const filePathIndex = useMemo(() => {
    if (!graph) return new Map<string, string>();
    const map = new Map<string, string>();
    for (const n of graph.nodes) {
      const fp = n.properties.filePath;
      if (n.label === 'File' && fp) map.set(normalizePath(fp), fp);
    }
    return map;
  }, [graph]);

  const resolveFilePath = useCallback(
    (requestedPath: string): string | null => {
      const normalized = normalizePath(requestedPath);
      if (filePathIndex.has(normalized)) return filePathIndex.get(normalized)!;
      for (const [key, value] of filePathIndex) {
        if (key.endsWith(normalized)) return value;
      }
      return null;
    },
    [filePathIndex],
  );

  const findFileNodeId = useCallback(
    (filePath: string): string | undefined => fileNodeByPath.get(normalizePath(filePath)),
    [fileNodeByPath],
  );

  const codeRefs = useCodeReferences({
    selectedNode,
    setAICitationHighlightedNodeIds: highlights.setAICitationHighlightedNodeIds,
  });

  const chatAgent = useChatAgent({
    repoRef,
    projectName,
    graph,
    embeddingStatus: embedding.embeddingStatus,
    graphViewType,
    cityMetric,
    semanticClusterData,
    selectedNodeName: selectedNode?.properties?.name ?? null,
    resolveFilePath,
    findFileNodeId,
    addCodeReference: codeRefs.addCodeReference,
    clearAICodeReferences: codeRefs.clearAICodeReferences,
    clearAIToolHighlights: highlights.clearAIToolHighlights,
    setAIToolHighlightedNodeIds: highlights.setAIToolHighlightedNodeIds,
    setBlastRadiusNodeIds: highlights.setBlastRadiusNodeIds,
  });

  // ── Derived methods ────────────────────────────────────────────────────────

  const openCodePanel = useCallback(() => codeRefs.setCodePanelOpen(true), [codeRefs.setCodePanelOpen]);

  const openChatPanel = useCallback(() => {
    setRightPanelOpen(true);
    setRightPanelTab('chat');
  }, []);

  const clearQueryHighlights = useCallback(() => {
    setHighlightedNodeIds(new Set());
    setQueryResult(null);
  }, [setHighlightedNodeIds]);

  const runQuery = useCallback(
    async (cypher: string): Promise<any[]> => backendRunQuery(cypher, repoRef.current),
    [],
  );

  const isDatabaseReady = useCallback(async (): Promise<boolean> => probeBackend(), []);

  // Auto-open code panel when a node is selected
  useEffect(() => {
    if (!selectedNode) return;
    codeRefs.setCodePanelOpen(true);
  }, [selectedNode, codeRefs.setCodePanelOpen]);

  // ── Repo switching ─────────────────────────────────────────────────────────

  const switchRepo = useCallback(
    async (repoName: string) => {
      if (!serverBaseUrl) return;

      setProgress({
        phase: 'extracting',
        percent: 0,
        message: 'Switching repository...',
        detail: `Loading ${repoName}`,
      });
      setViewMode('loading');
      chatAgent.setIsAgentReady(false);

      setHighlightedNodeIds(new Set());
      highlights.clearAIToolHighlights();
      highlights.clearAICitationHighlights();
      highlights.clearBlastRadius();
      setSelectedNode(null);
      setQueryResult(null);
      codeRefs.setCodeReferences([]);
      codeRefs.setCodePanelOpen(false);
      codeRefs.setCodeReferenceFocus(null);

      try {
        const result: ConnectResult = await connectToServer(
          serverBaseUrl,
          (phase, downloaded, total) => {
            if (phase === 'validating') {
              setProgress({
                phase: 'extracting',
                percent: 5,
                message: 'Switching repository...',
                detail: 'Validating',
              });
            } else if (phase === 'downloading') {
              const pct = total ? Math.round((downloaded / total) * 90) + 5 : 50;
              const mb = (downloaded / (1024 * 1024)).toFixed(1);
              setProgress({
                phase: 'extracting',
                percent: pct,
                message: 'Downloading graph...',
                detail: `${mb} MB downloaded`,
              });
            } else if (phase === 'extracting') {
              setProgress({
                phase: 'extracting',
                percent: 97,
                message: 'Processing...',
                detail: 'Extracting file contents',
              });
            }
          },
          undefined,
          repoName,
        );

        const repoPath = result.repoInfo.repoPath ?? result.repoInfo.path;
        const pName =
          repoName || result.repoInfo.name || repoPath?.split('/').pop() || 'server-project';
        setProjectName(pName);
        repoRef.current = pName;

        const newGraph = createKnowledgeGraph();
        for (const node of result.nodes) newGraph.addNode(node);
        for (const rel of result.relationships) newGraph.addRelationship(rel);
        setGraph(newGraph);

        try {
          if (getActiveProviderConfig()) {
            await chatAgent.initializeAgent(pName);
          }
          setGraphViewType('structural');
          setViewMode('exploring');
          embedding.startEmbeddingsWithFallback();
          setProgress(null);
        } catch (err) {
          console.warn('Failed to initialize agent:', err);
          chatAgent.setIsAgentReady(false);
          chatAgent.agentRef.current = null;
          setGraphViewType('structural');
          setViewMode('exploring');
          setProgress(null);
        }
      } catch (err) {
        console.error('Repo switch failed:', err);
        setProgress({
          phase: 'error',
          percent: 0,
          message: 'Failed to switch repository',
          detail: err instanceof Error ? err.message : 'Unknown error',
        });
        chatAgent.setIsAgentReady(false);
        chatAgent.agentRef.current = null;
        setTimeout(() => {
          setGraphViewType('structural');
          setViewMode('exploring');
          setProgress(null);
        }, ERROR_RESET_DELAY_MS);
      }
    },
    [
      serverBaseUrl,
      setProgress,
      setViewMode,
      setProjectName,
      setGraph,
      chatAgent,
      embedding.startEmbeddingsWithFallback,
      setHighlightedNodeIds,
      highlights,
      setSelectedNode,
      setQueryResult,
      codeRefs,
    ],
  );

  // ── Context value ──────────────────────────────────────────────────────────

  const value: AppState = {
    viewMode,
    setViewMode,
    graph,
    setGraph,
    selectedNode,
    setSelectedNode,
    isRightPanelOpen,
    setRightPanelOpen,
    rightPanelTab,
    setRightPanelTab,
    openCodePanel,
    openChatPanel,
    helpDialogBoxOpen,
    setHelpDialogBoxOpen,
    visibleLabels,
    toggleLabelVisibility,
    visibleEdgeTypes,
    toggleEdgeVisibility,
    depthFilter,
    setDepthFilter,
    highlightedNodeIds,
    setHighlightedNodeIds,
    aiCitationHighlightedNodeIds: highlights.aiCitationHighlightedNodeIds,
    aiToolHighlightedNodeIds: highlights.aiToolHighlightedNodeIds,
    blastRadiusNodeIds: highlights.blastRadiusNodeIds,
    isAIHighlightsEnabled: highlights.isAIHighlightsEnabled,
    toggleAIHighlights: highlights.toggleAIHighlights,
    clearAIToolHighlights: highlights.clearAIToolHighlights,
    clearAICitationHighlights: highlights.clearAICitationHighlights,
    clearBlastRadius: highlights.clearBlastRadius,
    queryResult,
    setQueryResult,
    clearQueryHighlights,
    animatedNodes: highlights.animatedNodes,
    triggerNodeAnimation: highlights.triggerNodeAnimation,
    clearAnimations: highlights.clearAnimations,
    progress,
    setProgress,
    projectName,
    setProjectName,
    serverBaseUrl,
    setServerBaseUrl,
    availableRepos,
    setAvailableRepos,
    switchRepo,
    runQuery,
    isDatabaseReady,
    embeddingStatus: embedding.embeddingStatus,
    embeddingProgress: embedding.embeddingProgress,
    startEmbeddings: embedding.startEmbeddings,
    startEmbeddingsWithFallback: embedding.startEmbeddingsWithFallback,
    semanticSearch: embedding.semanticSearch,
    semanticSearchWithContext: embedding.semanticSearchWithContext,
    isEmbeddingReady: embedding.isEmbeddingReady,
    llmSettings: chatAgent.llmSettings,
    updateLLMSettings: chatAgent.updateLLMSettings,
    isSettingsPanelOpen,
    setSettingsPanelOpen,
    isSidebarCollapsed,
    setSidebarCollapsed,
    graphViewType,
    setGraphViewType,
    cityMetric,
    setCityMetric,
    externalDeps,
    setExternalDeps,
    semanticClusterData,
    setSemanticClusterData,
    isAgentReady: chatAgent.isAgentReady,
    isAgentInitializing: chatAgent.isAgentInitializing,
    agentError: chatAgent.agentError,
    chatMessages: chatAgent.chatMessages,
    isChatLoading: chatAgent.isChatLoading,
    currentToolCalls: chatAgent.currentToolCalls,
    refreshLLMSettings: chatAgent.refreshLLMSettings,
    initializeAgent: chatAgent.initializeAgent,
    sendChatMessage: chatAgent.sendChatMessage,
    stopChatResponse: chatAgent.stopChatResponse,
    clearChat: chatAgent.clearChat,
    codeReferences: codeRefs.codeReferences,
    isCodePanelOpen: codeRefs.isCodePanelOpen,
    setCodePanelOpen: codeRefs.setCodePanelOpen,
    addCodeReference: codeRefs.addCodeReference,
    removeCodeReference: codeRefs.removeCodeReference,
    clearAICodeReferences: codeRefs.clearAICodeReferences,
    clearCodeReferences: codeRefs.clearCodeReferences,
    codeReferenceFocus: codeRefs.codeReferenceFocus,
  };

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
};

export const useAppState = (): AppState => {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error('useAppState must be used within AppStateProvider');
  }
  return context;
};
