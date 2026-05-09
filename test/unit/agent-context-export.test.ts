import { describe, expect, it } from 'vitest';
import { createKnowledgeGraph } from '../../src/core/graph/graph';
import { createFileNode, createFunctionNode } from '../fixtures/graph';
import { buildAgentContext } from '../../src/lib/agent-context-export';
import type { GraphRelationship } from 'gitnexus-shared';

function importsRel(from: string, to: string): GraphRelationship {
  return { id: `${from}_IMPORTS_${to}`, sourceId: from, targetId: to, type: 'IMPORTS', confidence: 1, reason: '' };
}

describe('buildAgentContext', () => {
  it('returns a string with all five sections', () => {
    const g = createKnowledgeGraph();
    const content = buildAgentContext(g, 'my-project', {});
    expect(content).toContain('# GraphMyCode — Agent Context Export');
    expect(content).toContain('## Context Prompt');
    expect(content).toContain('## Project Structure');
    expect(content).toContain('## Key Nodes');
    expect(content).toContain('## Main Dependencies');
    expect(content).toContain('## Detected Communities');
  });

  it('includes project name in header', () => {
    const g = createKnowledgeGraph();
    const content = buildAgentContext(g, 'awesome-agent', {});
    expect(content).toContain('Project: awesome-agent');
  });

  it("includes today's date in header", () => {
    const g = createKnowledgeGraph();
    const content = buildAgentContext(g, 'p', {});
    const today = new Date().toISOString().slice(0, 10);
    expect(content).toContain(`Generated: ${today}`);
  });

  it('lists top nodes by degree', () => {
    const g = createKnowledgeGraph();
    const a = createFileNode('a.ts', 'src/a.ts');
    const b = createFileNode('b.ts', 'src/b.ts');
    const c = createFileNode('c.ts', 'src/c.ts');
    g.addNode(a); g.addNode(b); g.addNode(c);
    // a has 2 connections, b has 1, c has 1
    g.addRelationship(importsRel(a.id, b.id));
    g.addRelationship(importsRel(a.id, c.id));
    const content = buildAgentContext(g, 'p', {});
    const keyNodesSection = content.split('## Key Nodes')[1].split('##')[0];
    // a.ts should appear first (highest degree)
    expect(keyNodesSection.indexOf('a.ts')).toBeLessThan(keyNodesSection.indexOf('b.ts'));
  });

  it('lists external dependencies', () => {
    const g = createKnowledgeGraph();
    const fileNode = createFileNode('agent.py', 'src/agent.py');
    g.addNode(fileNode);
    const content = buildAgentContext(g, 'p', { [fileNode.id]: ['anthropic', 'openai'] });
    const depsSection = content.split('## Main Dependencies')[1].split('##')[0];
    expect(depsSection).toContain('anthropic');
    expect(depsSection).toContain('openai');
  });

  it('deduplicates external dependencies across files', () => {
    const g = createKnowledgeGraph();
    const a = createFileNode('a.py', 'a.py');
    const b = createFileNode('b.py', 'b.py');
    g.addNode(a); g.addNode(b);
    const content = buildAgentContext(g, 'p', {
      [a.id]: ['anthropic'],
      [b.id]: ['anthropic', 'openai'],
    });
    const depsSection = content.split('## Main Dependencies')[1].split('##')[0];
    const matches = (depsSection.match(/anthropic/g) ?? []).length;
    expect(matches).toBe(1);
  });

  it('shows no communities message when graph has none', () => {
    const g = createKnowledgeGraph();
    const content = buildAgentContext(g, 'p', {});
    expect(content).toContain('No communities detected.');
  });

  it('lists community nodes when present', () => {
    const g = createKnowledgeGraph();
    g.addNode({
      id: 'comm_0',
      label: 'Community',
      properties: { name: 'Orchestration', heuristicLabel: 'Orchestration' },
    });
    const content = buildAgentContext(g, 'p', {});
    expect(content).toContain('Orchestration');
  });
});
