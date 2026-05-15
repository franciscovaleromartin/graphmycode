// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

import { useState, useCallback, useRef } from 'react';
import type { KnowledgeGraph } from '../../core/graph/types';
import type {
  LLMSettings,
  AgentStreamChunk,
  ChatMessage,
  ToolCallInfo,
  MessageStep,
} from '../../core/llm/types';
import { loadSettings, getActiveProviderConfig, saveSettings } from '../../core/llm/settings-service';
import type { AgentMessage } from '../../core/llm/agent';
import { buildUIContext } from '../../core/llm/context-builder';
import { computeHeatmapData } from '../../lib/heatmap-metrics';
import {
  runQuery as backendRunQuery,
  search as backendSearch,
  grep as backendGrep,
  readFile as backendReadFile,
} from '../../services/backend-client';
import { FILE_REF_REGEX, NODE_REF_REGEX } from '../../lib/grounding-patterns';
import type { CodeReference } from './useCodeReferences';
import type { EmbeddingStatus } from './useEmbedding';

interface ChatAgentDeps {
  repoRef: React.MutableRefObject<string | undefined>;
  projectName: string;
  graph: KnowledgeGraph | null;
  embeddingStatus: EmbeddingStatus;
  graphViewType: 'structural' | 'semantic' | 'city' | 'heatmap' | 'codeflow';
  cityMetric: 'degree' | 'depth';
  semanticClusterData: any[] | null;
  selectedNodeName: string | null;
  resolveFilePath: (path: string) => string | null;
  findFileNodeId: (path: string) => string | undefined;
  addCodeReference: (ref: Omit<CodeReference, 'id'>) => void;
  clearAICodeReferences: () => void;
  clearAIToolHighlights: () => void;
  setAIToolHighlightedNodeIds: (ids: Set<string>) => void;
  setBlastRadiusNodeIds: (ids: Set<string>) => void;
}

export function useChatAgent(deps: ChatAgentDeps) {
  const [llmSettings, setLLMSettings] = useState<LLMSettings>(loadSettings);
  const [isAgentReady, setIsAgentReady] = useState(false);
  const [isAgentInitializing, setIsAgentInitializing] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [currentToolCalls, setCurrentToolCalls] = useState<ToolCallInfo[]>([]);
  const agentRef = useRef<any>(null);

  const updateLLMSettings = useCallback((updates: Partial<LLMSettings>) => {
    setLLMSettings((prev) => {
      const next = { ...prev, ...updates };
      saveSettings(next);
      return next;
    });
  }, []);

  const refreshLLMSettings = useCallback(() => setLLMSettings(loadSettings()), []);

  const initializeAgent = useCallback(
    async (overrideProjectName?: string): Promise<void> => {
      const config = getActiveProviderConfig();
      if (!config) {
        setAgentError('Please configure an LLM provider in settings');
        return;
      }

      setIsAgentInitializing(true);
      setAgentError(null);

      try {
        const effectiveProjectName = overrideProjectName || deps.projectName || 'project';
        const repo = deps.repoRef.current;

        const { createGraphRAGAgent } = await import('../../core/llm/agent');
        const { buildCodebaseContext } = await import('../../core/llm/context-builder');

        const executeQuery = (cypher: string) => backendRunQuery(cypher, repo);
        const codebaseContext = await buildCodebaseContext(executeQuery, effectiveProjectName);

        const backend = {
          executeQuery,
          search: (query: string, opts?: any) => backendSearch(query, { ...opts, repo }),
          grep: (pattern: string, limit?: number) => backendGrep(pattern, repo, limit),
          readFile: (filePath: string) => backendReadFile(filePath, { repo }).then((r) => r.content),
        };

        agentRef.current = createGraphRAGAgent(config, backend, codebaseContext);
        setIsAgentReady(true);
        setAgentError(null);
        if (import.meta.env.DEV) console.log('✅ Agent initialized successfully');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setAgentError(message);
        setIsAgentReady(false);
      } finally {
        setIsAgentInitializing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deps.projectName],
  );

  const sendChatMessage = useCallback(
    async (message: string): Promise<void> => {
      deps.clearAICodeReferences();
      deps.clearAIToolHighlights();

      if (!isAgentReady) {
        await initializeAgent();
        if (!agentRef.current) return;
      }

      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: message,
        timestamp: Date.now(),
      };
      setChatMessages((prev) => [...prev, userMessage]);

      if (deps.embeddingStatus === 'indexing') {
        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: 'Wait a moment, vector index is being created.',
          timestamp: Date.now(),
        };
        setChatMessages((prev) => [...prev, assistantMessage]);
        setAgentError(null);
        setIsChatLoading(false);
        setCurrentToolCalls([]);
        return;
      }

      setIsChatLoading(true);
      setCurrentToolCalls([]);

      const history: AgentMessage[] = [...chatMessages, userMessage].map((m) => ({
        role: m.role === 'tool' ? 'assistant' : m.role,
        content: m.content,
      }));

      const assistantMessageId = `assistant-${Date.now()}`;
      const stepsForMessage: MessageStep[] = [];
      const toolCallsForMessage: ToolCallInfo[] = [];
      let stepCounter = 0;

      const updateMessage = () => {
        const contentParts = stepsForMessage
          .flatMap((s) =>
            (s.type === 'reasoning' || s.type === 'content') && s.content ? [s.content] : [],
          );
        const content = contentParts.join('\n\n');

        setChatMessages((prev) => {
          const existing = prev.find((m) => m.id === assistantMessageId);
          const newMessage: ChatMessage = {
            id: assistantMessageId,
            role: 'assistant' as const,
            content,
            steps: [...stepsForMessage],
            toolCalls: [...toolCallsForMessage],
            timestamp: existing?.timestamp ?? Date.now(),
          };
          if (existing) {
            return prev.map((m) => (m.id === assistantMessageId ? newMessage : m));
          }
          return [...prev, newMessage];
        });
      };

      let pendingUpdate = false;
      const scheduleMessageUpdate = () => {
        if (pendingUpdate) return;
        pendingUpdate = true;
        requestAnimationFrame(() => {
          pendingUpdate = false;
          updateMessage();
        });
      };

      const parseNodeIds = (raw: string, graph: KnowledgeGraph | null): Set<string> => {
        const rawIds = raw.split(',').flatMap((id: string) => {
          const t = id.trim();
          return t ? [t] : [];
        });
        if (rawIds.length === 0 || !graph) return new Set(rawIds);

        const matched = new Set<string>();
        const graphNodeIdSet = new Set(graph.nodes.map((n) => n.id));
        for (const rawId of rawIds) {
          if (graphNodeIdSet.has(rawId)) {
            matched.add(rawId);
          } else {
            const found = graph.nodes.find(
              (n) => n.id.endsWith(rawId) || n.id.endsWith(':' + rawId),
            )?.id;
            if (found) matched.add(found);
          }
        }
        return matched;
      };

      try {
        const onChunk = (chunk: AgentStreamChunk) => {
          switch (chunk.type) {
            case 'reasoning':
              if (chunk.reasoning) {
                const lastStep = stepsForMessage[stepsForMessage.length - 1];
                if (lastStep && lastStep.type === 'reasoning') {
                  stepsForMessage[stepsForMessage.length - 1] = {
                    ...lastStep,
                    content: (lastStep.content || '') + chunk.reasoning,
                  };
                } else {
                  stepsForMessage.push({
                    id: `step-${stepCounter++}`,
                    type: 'reasoning',
                    content: chunk.reasoning,
                  });
                }
                scheduleMessageUpdate();
              }
              break;

            case 'content':
              if (chunk.content) {
                const lastStep = stepsForMessage[stepsForMessage.length - 1];
                if (lastStep && lastStep.type === 'content') {
                  stepsForMessage[stepsForMessage.length - 1] = {
                    ...lastStep,
                    content: (lastStep.content || '') + chunk.content,
                  };
                } else {
                  stepsForMessage.push({
                    id: `step-${stepCounter++}`,
                    type: 'content',
                    content: chunk.content,
                  });
                }
                scheduleMessageUpdate();

                const currentContentStep = stepsForMessage[stepsForMessage.length - 1];
                const fullText =
                  currentContentStep && currentContentStep.type === 'content'
                    ? currentContentStep.content || ''
                    : '';

                const fileRefRegex = new RegExp(FILE_REF_REGEX.source, FILE_REF_REGEX.flags);
                let fileMatch: RegExpExecArray | null;
                while ((fileMatch = fileRefRegex.exec(fullText)) !== null) {
                  const rawPath = fileMatch[1].trim();
                  const startLine1 = fileMatch[2] ? parseInt(fileMatch[2], 10) : undefined;
                  const endLine1 = fileMatch[3] ? parseInt(fileMatch[3], 10) : startLine1;

                  const resolvedPath = deps.resolveFilePath(rawPath);
                  if (!resolvedPath) continue;

                  const startLine0 =
                    startLine1 !== undefined ? Math.max(0, startLine1 - 1) : undefined;
                  const endLine0 = endLine1 !== undefined ? Math.max(0, endLine1 - 1) : startLine0;
                  const nodeId = deps.findFileNodeId(resolvedPath);

                  deps.addCodeReference({
                    filePath: resolvedPath,
                    startLine: startLine0,
                    endLine: endLine0,
                    nodeId,
                    label: 'File',
                    name: resolvedPath.split('/').pop() ?? resolvedPath,
                    source: 'ai',
                  });
                }

                const nodeRefRegex = new RegExp(NODE_REF_REGEX.source, NODE_REF_REGEX.flags);
                let nodeMatch: RegExpExecArray | null;
                while ((nodeMatch = nodeRefRegex.exec(fullText)) !== null) {
                  const nodeType = nodeMatch[1];
                  const nodeName = nodeMatch[2].trim();

                  if (!deps.graph) continue;
                  const node = deps.graph.nodes.find(
                    (n) => n.label === nodeType && n.properties.name === nodeName,
                  );
                  if (!node || !node.properties.filePath) continue;

                  const resolvedPath = deps.resolveFilePath(node.properties.filePath);
                  if (!resolvedPath) continue;

                  deps.addCodeReference({
                    filePath: resolvedPath,
                    startLine: node.properties.startLine
                      ? node.properties.startLine - 1
                      : undefined,
                    endLine: node.properties.endLine ? node.properties.endLine - 1 : undefined,
                    nodeId: node.id,
                    label: node.label,
                    name: node.properties.name,
                    source: 'ai',
                  });
                }
              }
              break;

            case 'tool_call':
              if (chunk.toolCall) {
                const tc = chunk.toolCall;
                toolCallsForMessage.push(tc);
                stepsForMessage.push({
                  id: `step-${stepCounter++}`,
                  type: 'tool_call',
                  toolCall: tc,
                });
                setCurrentToolCalls((prev) => [...prev, tc]);
                scheduleMessageUpdate();
              }
              break;

            case 'tool_result':
              if (chunk.toolCall) {
                const tc = chunk.toolCall;

                let idx = toolCallsForMessage.findIndex((t) => t.id === tc.id);
                if (idx < 0) idx = toolCallsForMessage.findIndex((t) => t.name === tc.name && t.status === 'running');
                if (idx < 0) idx = toolCallsForMessage.findIndex((t) => t.name === tc.name && !t.result);
                if (idx >= 0) {
                  toolCallsForMessage[idx] = { ...toolCallsForMessage[idx], result: tc.result, status: 'completed' };
                }

                const stepIdx = stepsForMessage.findIndex(
                  (s) =>
                    s.type === 'tool_call' &&
                    s.toolCall &&
                    (s.toolCall.id === tc.id ||
                      (s.toolCall.name === tc.name && s.toolCall.status === 'running')),
                );
                if (stepIdx >= 0 && stepsForMessage[stepIdx].toolCall) {
                  stepsForMessage[stepIdx] = {
                    ...stepsForMessage[stepIdx],
                    toolCall: { ...stepsForMessage[stepIdx].toolCall!, result: tc.result, status: 'completed' },
                  };
                }

                setCurrentToolCalls((prev) => {
                  let targetIdx = prev.findIndex((t) => t.id === tc.id);
                  if (targetIdx < 0) targetIdx = prev.findIndex((t) => t.name === tc.name && t.status === 'running');
                  if (targetIdx < 0) targetIdx = prev.findIndex((t) => t.name === tc.name && !t.result);
                  if (targetIdx >= 0) {
                    return prev.map((t, i) =>
                      i === targetIdx ? { ...t, result: tc.result, status: 'completed' } : t,
                    );
                  }
                  return prev;
                });

                scheduleMessageUpdate();

                if (tc.result) {
                  const highlightMatch = tc.result.match(/\[HIGHLIGHT_NODES:([^\]]+)\]/);
                  if (highlightMatch) {
                    const matched = parseNodeIds(highlightMatch[1], deps.graph);
                    if (matched.size > 0) deps.setAIToolHighlightedNodeIds(matched);
                  }

                  const impactMatch = tc.result.match(/\[IMPACT:([^\]]+)\]/);
                  if (impactMatch) {
                    const matched = parseNodeIds(impactMatch[1], deps.graph);
                    if (matched.size > 0) deps.setBlastRadiusNodeIds(matched);
                  }
                }
              }
              break;

            case 'error':
              setAgentError(chunk.error ?? 'Unknown error');
              break;

            case 'done':
              scheduleMessageUpdate();
              break;
          }
        };

        let cityTopDebtNodes: Array<{ name: string; label: string; filePath: string; value: number }> | undefined;
        if (deps.graphViewType === 'city' && deps.graph) {
          const rels = deps.graph.relationships;
          cityTopDebtNodes = deps.graph.nodes
            .flatMap((node) => {
              if (node.label === 'Community' || node.label === 'Process') return [];
              const value =
                deps.cityMetric === 'degree'
                  ? rels.filter((r) => r.sourceId === node.id || r.targetId === node.id).length
                  : (node.properties.filePath ?? '').split('/').length - 1;
              return [{ name: node.properties.name ?? node.id, label: node.label as string, filePath: node.properties.filePath ?? '', value }];
            })
            .sort((a, b) => b.value - a.value)
            .slice(0, 20);
        }

        let heatmapTopNodes: Array<{ name: string; filePath: string; degree: number; bidirectionalCount: number }> | undefined;
        if (deps.graphViewType === 'heatmap' && deps.graph) {
          const heatmapData = computeHeatmapData(deps.graph);
          heatmapTopNodes = heatmapData.nodes
            .sort((a, b) => b.degree - a.degree)
            .slice(0, 20)
            .map((n) => ({
              name: n.name,
              filePath: n.filePath,
              degree: n.degree,
              bidirectionalCount: heatmapData.edges.filter(
                (e) => e.isBidirectional && (e.source === n.id || e.target === n.id),
              ).length,
            }));
        }

        const uiContextBlock = buildUIContext(
          deps.graphViewType,
          deps.semanticClusterData,
          deps.selectedNodeName,
          deps.cityMetric,
          cityTopDebtNodes,
          heatmapTopNodes,
        );
        const historyWithContext: AgentMessage[] = history.map((msg, idx) =>
          idx === history.length - 1 && msg.role === 'user'
            ? { ...msg, content: `${uiContextBlock}${msg.content}` }
            : msg,
        );

        const agent = agentRef.current;
        if (!agent) throw new Error('Agent not initialized');
        const { streamAgentResponse } = await import('../../core/llm/agent');
        for await (const chunk of streamAgentResponse(agent, historyWithContext)) {
          onChunk(chunk);
        }
        onChunk({ type: 'done' });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setAgentError(message);
      } finally {
        setIsChatLoading(false);
        setCurrentToolCalls([]);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chatMessages, isAgentReady, initializeAgent, deps],
  );

  const stopChatResponse = useCallback(() => {
    if (isChatLoading) {
      setIsChatLoading(false);
      setCurrentToolCalls([]);
    }
  }, [isChatLoading]);

  const clearChat = useCallback(() => {
    setChatMessages([]);
    setCurrentToolCalls([]);
    setAgentError(null);
  }, []);

  return {
    llmSettings,
    updateLLMSettings,
    refreshLLMSettings,
    isAgentReady,
    setIsAgentReady,
    isAgentInitializing,
    agentError,
    agentRef,
    chatMessages,
    isChatLoading,
    currentToolCalls,
    initializeAgent,
    sendChatMessage,
    stopChatResponse,
    clearChat,
  };
}
