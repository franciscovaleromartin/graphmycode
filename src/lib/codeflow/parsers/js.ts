// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

import type { Tree, Node as TSNode } from 'web-tree-sitter';
import type { CodeFlowGraph, FlowNode, FlowEdge } from '../types';

export function parseJsTs(tree: Tree, deep = false): CodeFlowGraph {
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
          if (deep) {
            const consequence = child.childForFieldName('consequence');
            if (consequence?.type === 'statement_block') walkBody(consequence, id);
            const alt = child.childForFieldName('alternative');
            if (alt) {
              if (alt.type === 'statement_block') {
                walkBody(alt, id);
              } else if (alt.type === 'if_statement') {
                walkBody({ namedChildren: [alt] } as unknown as TSNode, id);
              }
            }
          }
          break;
        }
        case 'for_statement': {
          const id = uid('loop');
          nodes.push({ id, label: 'for (...)', type: 'loop' });
          edges.push({ id: uid('e'), source: parentId, target: id });
          if (deep) {
            const body = child.childForFieldName('body');
            if (body) walkBody(body, id);
          }
          break;
        }
        case 'for_in_statement': {
          const id = uid('loop');
          nodes.push({ id, label: 'for...in', type: 'loop' });
          edges.push({ id: uid('e'), source: parentId, target: id });
          if (deep) {
            const body = child.childForFieldName('body');
            if (body) walkBody(body, id);
          }
          break;
        }
        case 'for_of_statement': {
          const id = uid('loop');
          nodes.push({ id, label: 'for...of', type: 'loop' });
          edges.push({ id: uid('e'), source: parentId, target: id });
          if (deep) {
            const body = child.childForFieldName('body');
            if (body) walkBody(body, id);
          }
          break;
        }
        case 'while_statement': {
          const cond = child.childForFieldName('condition')?.text ?? '';
          const label = cond.length > 20 ? 'while (…)' : `while ${cond}`;
          const id = uid('loop');
          nodes.push({ id, label, type: 'loop' });
          edges.push({ id: uid('e'), source: parentId, target: id });
          if (deep) {
            const body = child.childForFieldName('body');
            if (body) walkBody(body, id);
          }
          break;
        }
        case 'do_statement': {
          const id = uid('loop');
          nodes.push({ id, label: 'do...while', type: 'loop' });
          edges.push({ id: uid('e'), source: parentId, target: id });
          if (deep) {
            const body = child.childForFieldName('body');
            if (body) walkBody(body, id);
          }
          break;
        }
        case 'try_statement': {
          const id = uid('try');
          nodes.push({ id, label: 'try / catch', type: 'error' });
          edges.push({ id: uid('e'), source: parentId, target: id });
          if (deep) {
            const body = child.childForFieldName('body');
            if (body) walkBody(body, id);
            const handler = child.childForFieldName('handler');
            if (handler) {
              const catchBody = handler.childForFieldName('body');
              if (catchBody) walkBody(catchBody, id);
            }
          }
          break;
        }
        case 'switch_statement': {
          if (!deep) break;
          const val = child.childForFieldName('value')?.text ?? 'expr';
          const raw = val.replace(/^\(|\)$/g, '');
          const label = 'switch ' + (raw.length > 18 ? raw.slice(0, 17) + '…' : raw);
          const id = uid('sw');
          nodes.push({ id, label, type: 'decision' });
          edges.push({ id: uid('e'), source: parentId, target: id });
          const switchBody = child.namedChildren.find((c: TSNode) => c.type === 'switch_body');
          if (switchBody) {
            for (const caseNode of switchBody.namedChildren) {
              if (caseNode.type === 'switch_case') {
                const caseVal = caseNode.childForFieldName('value')?.text ?? '';
                const caseLabel = 'case ' + (caseVal.length > 16 ? caseVal.slice(0, 15) + '…' : caseVal);
                const caseId = uid('case');
                nodes.push({ id: caseId, label: caseLabel, type: 'decision' });
                edges.push({ id: uid('e'), source: id, target: caseId });
                walkBody(caseNode, caseId);
              } else if (caseNode.type === 'switch_default') {
                const defaultId = uid('default');
                nodes.push({ id: defaultId, label: 'default', type: 'decision' });
                edges.push({ id: uid('e'), source: id, target: defaultId });
                walkBody(caseNode, defaultId);
              }
            }
          }
          break;
        }
        case 'function_declaration': {
          if (!deep) break;
          const name = child.childForFieldName('name')?.text ?? `fn${counter}`;
          const id = uid('fn');
          fnNameToId.set(name, id);
          nodes.push({ id, label: name, type: 'function' });
          edges.push({ id: uid('e'), source: parentId, target: id });
          const body = child.childForFieldName('body');
          if (body) walkBody(body, id);
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

  // Build O(1) lookup set of existing edge IDs before the loop to avoid O(n*m)
  const existingEdgeIds = new Set(edges.map((e) => e.id));
  for (const { fromId, callee } of pendingCalls) {
    const targetId = fnNameToId.get(callee);
    if (targetId && targetId !== fromId) {
      const edgeId = `call_${fromId}_${targetId}`;
      if (!existingEdgeIds.has(edgeId)) {
        edges.push({ id: edgeId, source: fromId, target: targetId });
        existingEdgeIds.add(edgeId);
      }
    }
  }

  return { nodes, edges };
}
