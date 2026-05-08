// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

export type FlowNodeType =
  | 'function'
  | 'method'
  | 'class'
  | 'decision'
  | 'loop'
  | 'error'
  | 'start'
  | 'end';

export interface FlowNode {
  id: string;
  label: string;
  type: FlowNodeType;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
}

export interface CodeFlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export const COMPATIBLE_EXTENSIONS = ['.js', '.ts', '.jsx', '.tsx', '.py'] as const;
