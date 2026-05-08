// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

import { graphlib, layout } from '@dagrejs/dagre';
import { loadParser, loadLanguage } from '../../core/tree-sitter/parser-loader';
import { SupportedLanguages } from '../../config/supported-languages';
import { parseJsTs } from './parsers/js';
import { parsePython } from './parsers/python';
import type { FlowNodeType } from './types';

const NODE_DIMS: Record<FlowNodeType, { width: number; height: number }> = {
  function: { width: 180, height: 44 },
  method:   { width: 170, height: 40 },
  class:    { width: 190, height: 46 },
  decision: { width: 150, height: 70 },
  loop:     { width: 160, height: 44 },
  error:    { width: 170, height: 44 },
  start:    { width: 120, height: 36 },
  end:      { width: 140, height: 36 },
};

function detectLanguage(filePath: string): SupportedLanguages | null {
  if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) return SupportedLanguages.TypeScript;
  if (filePath.endsWith('.js') || filePath.endsWith('.jsx')) return SupportedLanguages.JavaScript;
  if (filePath.endsWith('.py')) return SupportedLanguages.Python;
  return null;
}

export async function buildDagreGraph(filePath: string, content: string): Promise<graphlib.Graph> {
  const lang = detectLanguage(filePath);
  if (!lang) throw new Error(`Unsupported file type: ${filePath}`);

  const parser = await loadParser();
  await loadLanguage(lang, filePath);
  const tree = parser.parse(content);

  const flow =
    lang === SupportedLanguages.Python ? parsePython(tree) : parseJsTs(tree);

  const g = new graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 55, ranksep: 65, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of flow.nodes) {
    const dims = NODE_DIMS[node.type];
    g.setNode(node.id, { label: node.label, nodeType: node.type, ...dims });
  }

  for (const edge of flow.edges) {
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
      g.setEdge(edge.source, edge.target, { edgeId: edge.id });
    }
  }

  layout(g);

  return g;
}
