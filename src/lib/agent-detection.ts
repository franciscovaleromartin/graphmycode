// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

import type { KnowledgeGraph } from '../core/graph/types';
import { isSystemFile } from './system-file-filter';

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

// Frontend-only frameworks that, without agent signals, indicate a plain UI project
const FRONTEND_FRAMEWORKS = new Set([
  'react', 'vue', 'svelte', 'next', 'angular',
]);

// isAgent requires confidence >= this threshold AND >= 2 distinct signal categories
const CONFIDENCE_THRESHOLD = 0.55;

export function detectAgentCode(
  graph: KnowledgeGraph,
  externalDeps: Record<string, string[]>,
): AgentDetectionResult {
  // Build set of system/OS artifact node IDs to ignore in all signals
  const systemNodeIds = new Set<string>(
    graph.nodes
      .filter((n) => isSystemFile(n.properties.filePath ?? n.properties.name ?? ''))
      .map((n) => n.id),
  );

  // ── Category A: AI framework imports (+0.35 first, +0.10 each additional) ──
  const foundFrameworks = new Set<string>();
  let hasFrontendOnly = false;

  for (const [nodeId, pkgs] of Object.entries(externalDeps)) {
    if (systemNodeIds.has(nodeId)) continue;
    for (const pkg of pkgs) {
      if (AI_FRAMEWORKS.has(pkg)) foundFrameworks.add(pkg);
      if (FRONTEND_FRAMEWORKS.has(pkg)) hasFrontendOnly = true;
    }
  }

  const categoryAScore =
    foundFrameworks.size > 0
      ? 0.35 + (foundFrameworks.size - 1) * 0.10
      : 0;

  // ── Category B: Agent config files (+0.30 per file) ──────────────────────
  let categoryBScore = 0;
  for (const node of graph.nodes) {
    if (node.label !== 'File') continue;
    if (systemNodeIds.has(node.id)) continue;
    const basename = (node.properties.filePath ?? node.properties.name ?? '')
      .split('/')
      .pop() ?? '';
    if (AGENT_CONFIG_FILES.has(basename)) {
      categoryBScore += 0.30;
    }
  }

  // ── Category C: Agent function/method names (+0.12 each, max 0.25) ───────
  let categoryCScore = 0;
  for (const node of graph.nodes) {
    if (node.label !== 'Function' && node.label !== 'Method') continue;
    if (systemNodeIds.has(node.id)) continue;
    const name = (node.properties.name ?? '').toLowerCase();
    if (AGENT_FUNCTION_PATTERNS.some((p) => name.includes(p))) {
      categoryCScore = Math.min(categoryCScore + 0.12, 0.25);
    }
  }

  // ── Category D: Subagent patterns in names/paths (+0.20 each, max 0.30) ──
  let categoryDScore = 0;
  for (const node of graph.nodes) {
    if (systemNodeIds.has(node.id)) continue;
    const name = (node.properties.name ?? '').toLowerCase();
    const path = (node.properties.filePath ?? '').toLowerCase();
    const text = `${name} ${path}`;
    if (SUBAGENT_PATTERNS.some((p) => text.includes(p))) {
      categoryDScore = Math.min(categoryDScore + 0.20, 0.30);
    }
  }

  // ── Sum and count distinct fired categories ───────────────────────────────
  const scores = [categoryAScore, categoryBScore, categoryCScore, categoryDScore];
  let confidence = scores.reduce((sum, s) => sum + s, 0);
  const categoriesFired = scores.filter((s) => s > 0).length;

  // ── Frontend discount: pure UI project without orchestration signals ───────
  // If the project uses frontend frameworks but has no agent config files
  // and no orchestration functions, subtract 0.20 (likely a false positive).
  const hasAgentConfigOrOrchestration = categoryBScore > 0 || categoryCScore > 0;
  if (hasFrontendOnly && !hasAgentConfigOrOrchestration) {
    confidence = Math.max(0, confidence - 0.20);
  }

  return {
    isAgent: confidence >= CONFIDENCE_THRESHOLD && categoriesFired >= 2,
    confidence: Math.min(confidence, 1.0),
  };
}
