// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

import type { Tree, Node as TSNode } from 'web-tree-sitter';
import type { CodeFlowGraph, FlowNode, FlowEdge } from '../types';

export function parseJsTs(tree: Tree): CodeFlowGraph {
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  let counter = 0;
  const uid = (prefix: string) => `${prefix}_${counter++}`;

  const fnNameToId = new Map<string, string>();
  const pendingCalls: { fromId: string; callee: string }[] = [];

  const startId = uid('start');
  nodes.push({ id: startId, label: 'START', type: 'start' });

  function walk(node: TSNode, parentId: string) {
    for (const child of node.namedChildren) {
      switch (child.type) {
        case 'function_declaration': {
          const name = child.childForFieldName('name')?.text ?? `fn${counter}`;
          const id = uid('fn');
          fnNameToId.set(name, id);
          nodes.push({ id, label: name, type: 'function' });
          edges.push({ id: uid('e'), source: parentId, target: id });
          const body = child.childForFieldName('body');
          if (body) walkBody(body, id);
          break;
        }
        case 'class_declaration': {
          const name = child.childForFieldName('name')?.text ?? `Class${counter}`;
          const classId = uid('cls');
          nodes.push({ id: classId, label: name, type: 'class' });
          edges.push({ id: uid('e'), source: parentId, target: classId });
          const body = child.childForFieldName('body');
          if (body) walkClassBody(body, classId);
          break;
        }
        case 'lexical_declaration':
        case 'variable_declaration': {
          for (const decl of child.namedChildren) {
            if (decl.type !== 'variable_declarator') continue;
            const name = decl.childForFieldName('name')?.text;
            const value = decl.childForFieldName('value');
            if (!name || !value) continue;
            if (value.type === 'arrow_function' || value.type === 'function_expression') {
              const id = uid('fn');
              fnNameToId.set(name, id);
              nodes.push({ id, label: name, type: 'function' });
              edges.push({ id: uid('e'), source: parentId, target: id });
              const fnBody = value.childForFieldName('body');
              if (fnBody?.type === 'statement_block') walkBody(fnBody, id);
            }
          }
          break;
        }
        default:
          walk(child, parentId);
      }
    }
  }

  function walkClassBody(node: TSNode, classId: string) {
    for (const child of node.namedChildren) {
      if (child.type !== 'method_definition') continue;
      const name = child.childForFieldName('name')?.text ?? `method${counter}`;
      const id = uid('mth');
      fnNameToId.set(name, id);
      nodes.push({ id, label: name, type: 'method' });
      edges.push({ id: uid('e'), source: classId, target: id });
      const body = child.childForFieldName('body');
      if (body) walkBody(body, id);
    }
  }

  function walkBody(node: TSNode, parentId: string) {
    for (const child of node.namedChildren) {
      switch (child.type) {
        case 'if_statement': {
          const cond = child.childForFieldName('condition')?.text ?? 'condition';
          const label = cond.length > 28 ? cond.slice(0, 27) + '…' : cond;
          const id = uid('if');
          nodes.push({ id, label, type: 'decision' });
          edges.push({ id: uid('e'), source: parentId, target: id });
          break;
        }
        case 'for_statement': {
          const id = uid('loop');
          nodes.push({ id, label: 'for (...)', type: 'loop' });
          edges.push({ id: uid('e'), source: parentId, target: id });
          break;
        }
        case 'for_in_statement': {
          const id = uid('loop');
          nodes.push({ id, label: 'for...in', type: 'loop' });
          edges.push({ id: uid('e'), source: parentId, target: id });
          break;
        }
        case 'for_of_statement': {
          const id = uid('loop');
          nodes.push({ id, label: 'for...of', type: 'loop' });
          edges.push({ id: uid('e'), source: parentId, target: id });
          break;
        }
        case 'while_statement': {
          const cond = child.childForFieldName('condition')?.text ?? '';
          const label = cond.length > 20 ? 'while (…)' : `while ${cond}`;
          const id = uid('loop');
          nodes.push({ id, label, type: 'loop' });
          edges.push({ id: uid('e'), source: parentId, target: id });
          break;
        }
        case 'do_statement': {
          const id = uid('loop');
          nodes.push({ id, label: 'do...while', type: 'loop' });
          edges.push({ id: uid('e'), source: parentId, target: id });
          break;
        }
        case 'try_statement': {
          const id = uid('try');
          nodes.push({ id, label: 'try / catch', type: 'error' });
          edges.push({ id: uid('e'), source: parentId, target: id });
          break;
        }
        case 'return_statement': {
          const arg = child.namedChildren[0];
          if (arg) {
            const raw = arg.text;
            const label = '↩ ' + (raw.length > 20 ? raw.slice(0, 19) + '…' : raw);
            const id = uid('ret');
            nodes.push({ id, label, type: 'end' });
            edges.push({ id: uid('e'), source: parentId, target: id });
          }
          break;
        }
        case 'expression_statement': {
          const expr = child.namedChildren[0];
          if (expr?.type === 'call_expression') {
            const fn = expr.childForFieldName('function');
            const callee =
              fn?.type === 'identifier'
                ? fn.text
                : fn?.type === 'member_expression'
                  ? fn.childForFieldName('property')?.text ?? ''
                  : '';
            if (callee) pendingCalls.push({ fromId: parentId, callee });
          }
          break;
        }
      }
    }
  }

  walk(tree.rootNode, startId);

  for (const { fromId, callee } of pendingCalls) {
    const targetId = fnNameToId.get(callee);
    if (targetId && targetId !== fromId) {
      const edgeId = `call_${fromId}_${targetId}`;
      if (!edges.some(e => e.id === edgeId)) {
        edges.push({ id: edgeId, source: fromId, target: targetId });
      }
    }
  }

  return { nodes, edges };
}
