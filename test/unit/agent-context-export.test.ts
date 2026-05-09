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

  it('does not include agent line when isAgent=false (default)', () => {
    const g = createKnowledgeGraph();
    const content = buildAgentContext(g, 'p', {});
    expect(content).not.toContain('Agent patterns detected');
  });

  it('includes agent line in header when isAgent=true', () => {
    const g = createKnowledgeGraph();
    const content = buildAgentContext(g, 'p', {}, true);
    expect(content).toContain('> ⚡ Agent patterns detected');
  });

  it('agent line appears before Context Prompt section', () => {
    const g = createKnowledgeGraph();
    const content = buildAgentContext(g, 'p', {}, true);
    expect(content.indexOf('Agent patterns detected')).toBeLessThan(
      content.indexOf('## Context Prompt'),
    );
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

  // ── System file filtering ─────────────────────────────────────────────────
  it('excludes __MACOSX/ nodes from key nodes and stats', () => {
    const g = createKnowledgeGraph();
    const real = createFileNode('agent.py', 'src/agent.py');
    const mac = createFileNode('agent.py', '__MACOSX/src/agent.py');
    g.addNode(real);
    g.addNode(mac);
    const content = buildAgentContext(g, 'p', {});
    // Only 1 real file should appear in stats
    expect(content).toContain('1 files');
  });

  it('excludes __MACOSX/ deps from Main Dependencies', () => {
    const g = createKnowledgeGraph();
    const real = createFileNode('agent.py', 'src/agent.py');
    const mac = createFileNode('agent.py', '__MACOSX/src/agent.py');
    g.addNode(real);
    g.addNode(mac);
    const content = buildAgentContext(g, 'p', {
      [real.id]: ['anthropic'],
      [mac.id]: ['openai'], // should be excluded
    });
    const depsSection = content.split('## Main Dependencies')[1].split('##')[0];
    expect(depsSection).toContain('anthropic');
    expect(depsSection).not.toContain('openai');
  });

  it('excludes .DS_Store and .vscode/ nodes from project structure', () => {
    const g = createKnowledgeGraph();
    g.addNode(createFileNode('settings.json', '.vscode/settings.json'));
    g.addNode(createFileNode('.DS_Store', 'src/.DS_Store'));
    g.addNode(createFileNode('agent.py', 'src/agent.py'));
    const content = buildAgentContext(g, 'p', {});
    // Only 1 clean file
    expect(content).toContain('1 files');
  });
});
