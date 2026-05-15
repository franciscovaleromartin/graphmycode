import { describe, expect, it } from 'vitest';
import { createKnowledgeGraph } from '../../src/core/graph/graph';
import { createFileNode, createFunctionNode } from '../fixtures/graph';
import { buildAgentContext } from '../../src/lib/agent-context';
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

  it('includes project name in header line', () => {
    const g = createKnowledgeGraph();
    const content = buildAgentContext(g, 'awesome-agent', {});
    expect(content).toContain('Project: awesome-agent');
  });

  it('Context Prompt contains project name as narrative (not as a labeled field)', () => {
    const g = createKnowledgeGraph();
    const content = buildAgentContext(g, 'my-project', {});
    const promptSection = content.split('## Context Prompt')[1].split('##')[0];
    expect(promptSection).toContain('my-project');
    expect(promptSection).not.toContain('Stack:');
    expect(promptSection).not.toContain('Size:');
    expect(promptSection).not.toContain('Architecture layers:');
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

  // ── Key Nodes format ──────────────────────────────────────────────────────
  it('File nodes in Key Nodes omit the filename column', () => {
    const g = createKnowledgeGraph();
    const a = createFileNode('app.py', 'src/app.py');
    g.addNode(a);
    const content = buildAgentContext(g, 'p', {});
    const keyNodesSection = content.split('## Key Nodes')[1].split('##')[0];
    // Should NOT contain "app.py | File | app.py"
    expect(keyNodesSection).not.toMatch(/app\.py \| File \| app\.py/);
    // Should contain "app.py | File | N connections"
    expect(keyNodesSection).toMatch(/app\.py \| File \| \d+ connections/);
  });

  it('non-File nodes in Key Nodes include the filename column', () => {
    const g = createKnowledgeGraph();
    g.addNode(createFunctionNode('run_agent', 'src/agent.py'));
    const content = buildAgentContext(g, 'p', {});
    const keyNodesSection = content.split('## Key Nodes')[1].split('##')[0];
    // Should contain "run_agent | Function | agent.py | N connections"
    expect(keyNodesSection).toMatch(/run_agent \| Function \| agent\.py \| \d+ connections/);
  });

  // ── Main Dependencies: stdlib filtering ───────────────────────────────────
  it('filters Python stdlib modules from Main Dependencies', () => {
    const g = createKnowledgeGraph();
    const fileNode = createFileNode('agent.py', 'src/agent.py');
    g.addNode(fileNode);
    const content = buildAgentContext(g, 'p', {
      [fileNode.id]: ['anthropic', 'os', 'sys', 're', 'json', 'typing', 'pathlib'],
    });
    const depsSection = content.split('## Main Dependencies')[1].split('##')[0];
    expect(depsSection).toContain('anthropic');
    expect(depsSection).not.toContain('os');
    expect(depsSection).not.toContain('sys');
    expect(depsSection).not.toContain('typing');
    expect(depsSection).not.toContain('pathlib');
  });

  it('keeps non-stdlib packages even with similar names', () => {
    const g = createKnowledgeGraph();
    const fileNode = createFileNode('agent.py', 'src/agent.py');
    g.addNode(fileNode);
    const content = buildAgentContext(g, 'p', {
      [fileNode.id]: ['langchain', 'openai', 'pydantic'],
    });
    const depsSection = content.split('## Main Dependencies')[1].split('##')[0];
    expect(depsSection).toContain('langchain');
    expect(depsSection).toContain('openai');
    expect(depsSection).toContain('pydantic');
  });

  // ── Community deduplication ───────────────────────────────────────────────
  it('deduplicates communities with the same name and sums node counts', () => {
    const g = createKnowledgeGraph();
    g.addNode({ id: 'c1', label: 'Community', properties: { name: 'Backend', heuristicLabel: 'Backend', symbolCount: 8 } });
    g.addNode({ id: 'c2', label: 'Community', properties: { name: 'Backend', heuristicLabel: 'Backend', symbolCount: 5 } });
    g.addNode({ id: 'c3', label: 'Community', properties: { name: 'Frontend', heuristicLabel: 'Frontend', symbolCount: 3 } });
    const content = buildAgentContext(g, 'p', {});
    const commSection = content.split('## Detected Communities')[1];
    // Backend should appear once with total 13
    expect(commSection).toContain('Backend (13 nodes)');
    expect((commSection.match(/Backend/g) ?? []).length).toBe(1);
    expect(commSection).toContain('Frontend (3 nodes)');
  });

  it('renames Cluster_N communities to Uncategorized and groups them', () => {
    const g = createKnowledgeGraph();
    g.addNode({ id: 'c1', label: 'Community', properties: { name: 'Cluster_47', heuristicLabel: 'Cluster_47', symbolCount: 2 } });
    g.addNode({ id: 'c2', label: 'Community', properties: { name: 'Cluster_12', heuristicLabel: 'Cluster_12', symbolCount: 3 } });
    g.addNode({ id: 'c3', label: 'Community', properties: { name: 'Backend', heuristicLabel: 'Backend', symbolCount: 10 } });
    const content = buildAgentContext(g, 'p', {});
    const commSection = content.split('## Detected Communities')[1];
    expect(commSection).not.toContain('Cluster_47');
    expect(commSection).not.toContain('Cluster_12');
    expect(commSection).toContain('Uncategorized (5 nodes)');
    expect(commSection).toContain('Backend (10 nodes)');
  });

  it('sorts communities by node count descending', () => {
    const g = createKnowledgeGraph();
    g.addNode({ id: 'c1', label: 'Community', properties: { name: 'Small', symbolCount: 2 } });
    g.addNode({ id: 'c2', label: 'Community', properties: { name: 'Large', symbolCount: 20 } });
    const content = buildAgentContext(g, 'p', {});
    const commSection = content.split('## Detected Communities')[1];
    expect(commSection.indexOf('Large')).toBeLessThan(commSection.indexOf('Small'));
  });

  it('lists community nodes (legacy format check)', () => {
    const g = createKnowledgeGraph();
    g.addNode({
      id: 'comm_0',
      label: 'Community',
      properties: { name: 'Orchestration', heuristicLabel: 'Orchestration', symbolCount: 7 },
    });
    const content = buildAgentContext(g, 'p', {});
    expect(content).toContain('Orchestration (7 nodes)');
  });

  // ── System file filtering ─────────────────────────────────────────────────
  it('excludes __MACOSX/ nodes from Key Nodes section', () => {
    const g = createKnowledgeGraph();
    const real = createFileNode('agent.py', 'src/agent.py');
    const mac = createFileNode('agent.py', '__MACOSX/src/agent.py');
    g.addNode(real);
    g.addNode(mac);
    const content = buildAgentContext(g, 'p', {});
    const keyNodesSection = content.split('## Key Nodes')[1].split('##')[0];
    expect(keyNodesSection).not.toContain('__MACOSX');
  });

  it('excludes __MACOSX/ deps from Main Dependencies', () => {
    const g = createKnowledgeGraph();
    const real = createFileNode('agent.py', 'src/agent.py');
    const mac = createFileNode('agent.py', '__MACOSX/src/agent.py');
    g.addNode(real);
    g.addNode(mac);
    const content = buildAgentContext(g, 'p', {
      [real.id]: ['anthropic'],
      [mac.id]: ['openai'],
    });
    const depsSection = content.split('## Main Dependencies')[1].split('##')[0];
    expect(depsSection).toContain('anthropic');
    expect(depsSection).not.toContain('openai');
  });

  it('excludes .DS_Store and .vscode/ nodes from Project Structure', () => {
    const g = createKnowledgeGraph();
    g.addNode(createFileNode('settings.json', '.vscode/settings.json'));
    g.addNode(createFileNode('.DS_Store', 'src/.DS_Store'));
    g.addNode(createFileNode('agent.py', 'src/agent.py'));
    const content = buildAgentContext(g, 'p', {});
    const structureSection = content.split('## Project Structure')[1].split('##')[0];
    expect(structureSection).not.toContain('.vscode');
    expect(structureSection).not.toContain('.DS_Store');
  });
});
