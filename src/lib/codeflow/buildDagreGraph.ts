// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

import { graphlib, layout } from '@dagrejs/dagre';
import { loadParser, loadLanguage } from '../../core/tree-sitter/parser-loader';
import { SupportedLanguages } from '../../config/supported-languages';
import { parseJsTs } from './parsers/js';
import { parsePython } from './parsers/python';
import type { FlowNodeType } from './types';

const NODE_HEIGHTS: Record<FlowNodeType, number> = {
  function: 44, method: 40, class: 46,
  decision: 70, loop: 44, error: 44,
  start: 36, end: 36,
};

const NODE_MIN_WIDTH: Record<FlowNodeType, number> = {
  function: 120, method: 110, class: 120,
  decision: 100, loop: 110, error: 120,
  start: 80, end: 90,
};

const NODE_H_PAD: Record<FlowNodeType, number> = {
  function: 28, method: 28, class: 28,
  decision: 32, loop: 32, error: 28,
  start: 24, end: 24,
};

function nodeWidth(label: string, type: FlowNodeType): number {
  const CHAR_PX = 7.2; // 11px JetBrains Mono
  return Math.max(
    NODE_MIN_WIDTH[type] ?? 120,
    Math.ceil(label.length * CHAR_PX) + (NODE_H_PAD[type] ?? 28),
  );
}

function detectLanguage(filePath: string): SupportedLanguages | null {
  if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) return SupportedLanguages.TypeScript;
  if (filePath.endsWith('.js') || filePath.endsWith('.jsx')) return SupportedLanguages.JavaScript;
  if (filePath.endsWith('.py')) return SupportedLanguages.Python;
  return null;
}

export async function buildDagreGraph(
  filePath: string,
  content: string,
  deep = false,
): Promise<graphlib.Graph> {
  const lang = detectLanguage(filePath);
  if (!lang) throw new Error(`Unsupported file type: ${filePath}`);

  const parser = await loadParser();
  await loadLanguage(lang, filePath);
  const tree = parser.parse(content);
  if (!tree) throw new Error(`tree-sitter failed to parse: ${filePath}`);

  const flow =
    lang === SupportedLanguages.Python ? parsePython(tree, deep) : parseJsTs(tree, deep);

  const g = new graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 55, ranksep: 65, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of flow.nodes) {
    g.setNode(node.id, {
      label: node.label,
      nodeType: node.type,
      width: nodeWidth(node.label, node.type),
      height: NODE_HEIGHTS[node.type] ?? 44,
    });
  }

  for (const edge of flow.edges) {
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
      g.setEdge(edge.source, edge.target, { edgeId: edge.id });
    }
  }

  layout(g);

  return g;
}
