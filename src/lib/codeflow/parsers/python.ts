// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

import type { Tree, Node as TSNode } from 'web-tree-sitter';
import type { CodeFlowGraph, FlowNode, FlowEdge } from '../types';

export function parsePython(tree: Tree, deep = false): CodeFlowGraph {
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
        case 'function_definition': {
          const name = child.childForFieldName('name')?.text ?? `fn${counter}`;
          const id = uid('fn');
          fnNameToId.set(name, id);
          nodes.push({ id, label: name, type: 'function' });
          edges.push({ id: uid('e'), source: parentId, target: id });
          const body = child.childForFieldName('body');
          if (body) walkBody(body, id);
          break;
        }
        case 'decorated_definition': {
          const def = child.namedChildren.find(
            n => n.type === 'function_definition' || n.type === 'class_definition',
          );
          if (def) walk({ namedChildren: [def] } as unknown as TSNode, parentId);
          break;
        }
        case 'class_definition': {
          const name = child.childForFieldName('name')?.text ?? `Class${counter}`;
          const classId = uid('cls');
          nodes.push({ id: classId, label: name, type: 'class' });
          edges.push({ id: uid('e'), source: parentId, target: classId });
          const body = child.childForFieldName('body');
          if (body) walkClassBody(body, classId);
          break;
        }
        default:
          walk(child, parentId);
      }
    }
  }

  function walkClassBody(node: TSNode, classId: string) {
    for (const child of node.namedChildren) {
      if (child.type === 'function_definition') {
        const name = child.childForFieldName('name')?.text ?? `method${counter}`;
        const id = uid('mth');
        fnNameToId.set(name, id);
        nodes.push({ id, label: name, type: 'method' });
        edges.push({ id: uid('e'), source: classId, target: id });
        const body = child.childForFieldName('body');
        if (body) walkBody(body, id);
      }
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
            if (consequence) walkBody(consequence, id);
            for (const sibling of child.namedChildren) {
              if (sibling.type === 'elif_clause') {
                const elifCond = sibling.childForFieldName('condition')?.text ?? 'elif';
                const elifLabel = 'elif ' + (elifCond.length > 22 ? elifCond.slice(0, 21) + '…' : elifCond);
                const elifId = uid('elif');
                nodes.push({ id: elifId, label: elifLabel, type: 'decision' });
                edges.push({ id: uid('e'), source: id, target: elifId });
                const elifBody = sibling.childForFieldName('consequence') ?? sibling.namedChildren.find(c => c.type === 'block');
                if (elifBody) walkBody(elifBody, elifId);
              } else if (sibling.type === 'else_clause') {
                const elseBody = sibling.namedChildren.find(c => c.type === 'block');
                if (elseBody) walkBody(elseBody, id);
              }
            }
          }
          break;
        }
        case 'for_statement': {
          const left = child.childForFieldName('left')?.text ?? '';
          const right = child.childForFieldName('right')?.text ?? '';
          const raw = `${left} in ${right}`;
          const label = 'for ' + (raw.length > 22 ? raw.slice(0, 21) + '…' : raw);
          const id = uid('loop');
          nodes.push({ id, label, type: 'loop' });
          edges.push({ id: uid('e'), source: parentId, target: id });
          if (deep) {
            const body = child.childForFieldName('body');
            if (body) walkBody(body, id);
          }
          break;
        }
        case 'while_statement': {
          const cond = child.childForFieldName('condition')?.text ?? '';
          const label = cond.length > 22 ? 'while (…)' : `while ${cond}`;
          const id = uid('loop');
          nodes.push({ id, label, type: 'loop' });
          edges.push({ id: uid('e'), source: parentId, target: id });
          if (deep) {
            const body = child.childForFieldName('body');
            if (body) walkBody(body, id);
          }
          break;
        }
        case 'try_statement': {
          const id = uid('try');
          nodes.push({ id, label: 'try / except', type: 'error' });
          edges.push({ id: uid('e'), source: parentId, target: id });
          if (deep) {
            const body = child.childForFieldName('body');
            if (body) walkBody(body, id);
            for (const sibling of child.namedChildren) {
              if (sibling.type === 'except_clause') {
                const exceptBody = sibling.namedChildren.find(c => c.type === 'block');
                if (exceptBody) walkBody(exceptBody, id);
              }
            }
          }
          break;
        }
        case 'function_definition': {
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
          const val = child.namedChildren[0];
          if (val) {
            const raw = val.text;
            const label = '↩ ' + (raw.length > 20 ? raw.slice(0, 19) + '…' : raw);
            const id = uid('ret');
            nodes.push({ id, label, type: 'end' });
            edges.push({ id: uid('e'), source: parentId, target: id });
          }
          break;
        }
        case 'expression_statement': {
          const expr = child.namedChildren[0];
          if (expr?.type === 'call') {
            const fn = expr.childForFieldName('function');
            const callee =
              fn?.type === 'identifier'
                ? fn.text
                : fn?.type === 'attribute'
                  ? fn.childForFieldName('attribute')?.text ?? ''
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
