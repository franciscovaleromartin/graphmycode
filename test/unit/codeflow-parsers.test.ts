import { describe, it, expect } from 'vitest';
import { parseJsTs } from '../../src/lib/codeflow/parsers/js';
import { parsePython } from '../../src/lib/codeflow/parsers/python';
import type { Node as TSNode, Tree } from 'web-tree-sitter';

type MockFields = Record<string, MockNode | null>;
interface MockNode {
  type: string;
  text: string;
  namedChildren: MockNode[];
  childForFieldName(name: string): MockNode | null;
}

function n(
  type: string,
  text = '',
  namedChildren: MockNode[] = [],
  fields: MockFields = {},
): MockNode {
  return {
    type,
    text,
    namedChildren,
    childForFieldName: (name: string) => fields[name] ?? null,
  };
}

function tree(rootChildren: MockNode[]): Tree {
  const root = n('program', '', rootChildren);
  return { rootNode: root } as unknown as Tree;
}

describe('parseJsTs — alto nivel (deep=false)', () => {
  it('emite nodo START siempre', () => {
    const result = parseJsTs(tree([]), false);
    expect(result.nodes.some(nd => nd.type === 'start')).toBe(true);
  });

  it('detecta una function_declaration', () => {
    const body = n('statement_block', '{}');
    const fn = n('function_declaration', 'function foo() {}', [body], {
      name: n('identifier', 'foo'),
      body,
    });
    const result = parseJsTs(tree([fn]), false);
    expect(result.nodes.some(nd => nd.label === 'foo' && nd.type === 'function')).toBe(true);
  });

  it('detecta un if_statement dentro de una función', () => {
    const cond = n('parenthesized_expression', '(x > 0)');
    const ifNode = n('if_statement', 'if (x > 0) {}', [], {
      condition: cond,
      consequence: n('statement_block', '{}'),
    });
    const body = n('statement_block', '', [ifNode]);
    const fn = n('function_declaration', 'function foo() {}', [], {
      name: n('identifier', 'foo'),
      body,
    });
    const result = parseJsTs(tree([fn]), false);
    expect(result.nodes.some(nd => nd.type === 'decision')).toBe(true);
  });

  it('NO recursiona dentro del if en modo alto nivel', () => {
    const innerFor = n('for_statement', 'for(...) {}', [], {
      body: n('statement_block', '{}'),
    });
    const cond = n('parenthesized_expression', '(x)');
    const ifNode = n('if_statement', 'if (x) {}', [], {
      condition: cond,
      consequence: n('statement_block', '', [innerFor]),
    });
    const body = n('statement_block', '', [ifNode]);
    const fn = n('function_declaration', '', [], {
      name: n('identifier', 'outer'),
      body,
    });
    const result = parseJsTs(tree([fn]), false);
    // El if sí se detecta en modo alto nivel
    expect(result.nodes.some(nd => nd.type === 'decision')).toBe(true);
    // El for dentro del if NO debe aparecer en modo alto nivel
    expect(result.nodes.filter(nd => nd.type === 'loop')).toHaveLength(0);
  });
});

describe('parseJsTs — bajo nivel (deep=true)', () => {
  it('recursiona dentro del if y encuentra el for anidado', () => {
    const innerFor = n('for_statement', 'for(...) {}', [], {
      body: n('statement_block', '{}'),
    });
    const cond = n('parenthesized_expression', '(x)');
    const ifNode = n('if_statement', 'if (x) {}', [], {
      condition: cond,
      consequence: n('statement_block', '', [innerFor]),
    });
    const body = n('statement_block', '', [ifNode]);
    const fn = n('function_declaration', '', [], {
      name: n('identifier', 'outer'),
      body,
    });
    const result = parseJsTs(tree([fn]), true);
    expect(result.nodes.some(nd => nd.type === 'loop')).toBe(true);
  });

  it('recursiona dentro del for y encuentra el if anidado', () => {
    const cond = n('parenthesized_expression', '(y)');
    const innerIf = n('if_statement', 'if (y) {}', [], {
      condition: cond,
      consequence: n('statement_block', '{}'),
    });
    const forBody = n('statement_block', '', [innerIf]);
    const forNode = n('for_statement', 'for(...) {}', [], { body: forBody });
    const body = n('statement_block', '', [forNode]);
    const fn = n('function_declaration', '', [], {
      name: n('identifier', 'fn'),
      body,
    });
    const result = parseJsTs(tree([fn]), true);
    expect(result.nodes.some(nd => nd.type === 'decision')).toBe(true);
  });

  it('detecta switch_statement en bajo nivel', () => {
    const switchNode = n('switch_statement', 'switch(x) {}', [
      n('switch_body', '', [
        n('switch_case', 'case 1:', [], { value: n('number', '1') }),
      ]),
    ], { value: n('parenthesized_expression', '(x)') });
    const body = n('statement_block', '', [switchNode]);
    const fn = n('function_declaration', '', [], {
      name: n('identifier', 'fn'),
      body,
    });
    const result = parseJsTs(tree([fn]), true);
    expect(result.nodes.some(nd => nd.label.startsWith('switch'))).toBe(true);
  });
});

describe('parsePython — alto nivel (deep=false)', () => {
  it('emite nodo START siempre', () => {
    const result = parsePython(tree([]), false);
    expect(result.nodes.some(nd => nd.type === 'start')).toBe(true);
  });

  it('detecta una function_definition', () => {
    const body = n('block', '');
    const fn = n('function_definition', 'def foo():', [], {
      name: n('identifier', 'foo'),
      body,
    });
    const result = parsePython(tree([fn]), false);
    expect(result.nodes.some(nd => nd.label === 'foo' && nd.type === 'function')).toBe(true);
  });

  it('NO recursiona dentro del if en modo alto nivel', () => {
    const innerFor = n('for_statement', 'for x in xs:', [], {
      left: n('identifier', 'x'),
      right: n('identifier', 'xs'),
      body: n('block', ''),
    });
    const ifBody = n('block', '', [innerFor]);
    const ifNode = n('if_statement', 'if x:', [], {
      condition: n('identifier', 'x'),
      consequence: ifBody,
    });
    const fnBody = n('block', '', [ifNode]);
    const fn = n('function_definition', 'def foo():', [], {
      name: n('identifier', 'outer'),
      body: fnBody,
    });
    const result = parsePython(tree([fn]), false);
    expect(result.nodes.some(nd => nd.type === 'decision')).toBe(true); // el if sí
    expect(result.nodes.filter(nd => nd.type === 'loop')).toHaveLength(0); // el for no
  });
});

describe('parsePython — bajo nivel (deep=true)', () => {
  it('recursiona dentro del if de Python', () => {
    const innerWhile = n('while_statement', 'while True:', [], {
      condition: n('true', 'True'),
      body: n('block', ''),
    });
    const ifBody = n('block', '', [innerWhile]);
    const ifNode = n('if_statement', 'if x:', [], {
      condition: n('identifier', 'x'),
      consequence: ifBody,
    });
    const fnBody = n('block', '', [ifNode]);
    const fn = n('function_definition', 'def foo():', [], {
      name: n('identifier', 'foo'),
      body: fnBody,
    });
    const result = parsePython(tree([fn]), true);
    expect(result.nodes.some(nd => nd.type === 'loop')).toBe(true);
  });
});
