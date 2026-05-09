// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

import type { KnowledgeGraph } from '../core/graph/types';

export interface AgentDetectionResult {
  isAgent: boolean;
  confidence: number;
}

const AI_FRAMEWORKS = new Set([
  'anthropic', 'openai', 'langchain', 'litellm', 'autogen', 'crewai',
  'pydantic_ai', 'pydantic-ai', 'openai-agents', 'google-generativeai',
  'google-genai', 'groq', 'cohere', 'mistralai', 'together',
  '@anthropic-ai/sdk', '@langchain/core', '@langchain/openai', '@langchain/anthropic',
  'ai',
]);

const AGENT_CONFIG_FILES = new Set([
  'CLAUDE.md', 'AGENTS.md', '.mcp.json', 'system_prompt.txt',
]);

const AGENT_FUNCTION_PATTERNS = [
  'run_agent', 'execute_tool', 'run_tool', 'dispatch', 'invoke_tool',
];

const SUBAGENT_PATTERNS = [
  'subagent', 'sub_agent', 'multi_agent', 'orchestrat', 'spawn',
];

export function detectAgentCode(
  graph: KnowledgeGraph,
  externalDeps: Record<string, string[]>,
): AgentDetectionResult {
  let confidence = 0;

  // 1. AI framework imports (alto: +0.35 first, +0.10 each additional)
  const foundFrameworks = new Set<string>();
  for (const pkgs of Object.values(externalDeps)) {
    for (const pkg of pkgs) {
      if (AI_FRAMEWORKS.has(pkg)) foundFrameworks.add(pkg);
    }
  }
  if (foundFrameworks.size > 0) {
    confidence += 0.35 + (foundFrameworks.size - 1) * 0.10;
  }

  // 2. Agent config files (alto: +0.30 per file)
  for (const node of graph.nodes) {
    if (node.label !== 'File') continue;
    const basename = (node.properties.filePath ?? node.properties.name ?? '')
      .split('/')
      .pop() ?? '';
    if (AGENT_CONFIG_FILES.has(basename)) {
      confidence += 0.30;
    }
  }

  // 3. Agent function/method names (medio: +0.12 each, max 0.25)
  let functionScore = 0;
  for (const node of graph.nodes) {
    if (node.label !== 'Function' && node.label !== 'Method') continue;
    const name = (node.properties.name ?? '').toLowerCase();
    if (AGENT_FUNCTION_PATTERNS.some((p) => name.includes(p))) {
      functionScore = Math.min(functionScore + 0.12, 0.25);
    }
  }
  confidence += functionScore;

  // 4. Subagent patterns in names/paths (alto: +0.20 each, max 0.30)
  let subagentScore = 0;
  for (const node of graph.nodes) {
    const name = (node.properties.name ?? '').toLowerCase();
    const path = (node.properties.filePath ?? '').toLowerCase();
    const text = `${name} ${path}`;
    if (SUBAGENT_PATTERNS.some((p) => text.includes(p))) {
      subagentScore = Math.min(subagentScore + 0.20, 0.30);
    }
  }
  confidence += subagentScore;

  return {
    isAgent: confidence >= 0.35,
    confidence: Math.min(confidence, 1.0),
  };
}
