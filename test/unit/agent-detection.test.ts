import { describe, expect, it } from 'vitest';
import { createKnowledgeGraph } from '../../src/core/graph/graph';
import { createFileNode, createFunctionNode } from '../fixtures/graph';
import { detectAgentCode } from '../../src/lib/agent-detection';

describe('detectAgentCode', () => {
  it('returns false for an empty graph with no deps', () => {
    const g = createKnowledgeGraph();
    const result = detectAgentCode(g, {});
    expect(result.isAgent).toBe(false);
    expect(result.confidence).toBe(0);
  });

  it('detects anthropic import as agent (confidence >= 0.35)', () => {
    const g = createKnowledgeGraph();
    const fileNode = createFileNode('agent.py', 'src/agent.py');
    g.addNode(fileNode);
    const result = detectAgentCode(g, { [fileNode.id]: ['anthropic'] });
    expect(result.isAgent).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.35);
  });

  it('detects openai import as agent', () => {
    const g = createKnowledgeGraph();
    const fileNode = createFileNode('main.py', 'main.py');
    g.addNode(fileNode);
    const result = detectAgentCode(g, { [fileNode.id]: ['openai'] });
    expect(result.isAgent).toBe(true);
  });

  it('detects @anthropic-ai/sdk (JS SDK)', () => {
    const g = createKnowledgeGraph();
    const fileNode = createFileNode('agent.ts', 'src/agent.ts');
    g.addNode(fileNode);
    const result = detectAgentCode(g, { [fileNode.id]: ['@anthropic-ai/sdk'] });
    expect(result.isAgent).toBe(true);
  });

  it('increases confidence for multiple AI frameworks', () => {
    const g = createKnowledgeGraph();
    const fileA = createFileNode('a.py', 'src/a.py');
    const fileB = createFileNode('b.py', 'src/b.py');
    g.addNode(fileA);
    g.addNode(fileB);
    const single = detectAgentCode(g, { [fileA.id]: ['anthropic'] });
    const multi = detectAgentCode(g, { [fileA.id]: ['anthropic'], [fileB.id]: ['openai'] });
    expect(multi.confidence).toBeGreaterThan(single.confidence);
  });

  it('detects CLAUDE.md as partial signal (not enough alone)', () => {
    const g = createKnowledgeGraph();
    g.addNode(createFileNode('CLAUDE.md', 'CLAUDE.md'));
    const result = detectAgentCode(g, {});
    expect(result.isAgent).toBe(false);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThan(0.35);
  });

  it('detects AGENTS.md as partial signal', () => {
    const g = createKnowledgeGraph();
    g.addNode(createFileNode('AGENTS.md', 'AGENTS.md'));
    const result = detectAgentCode(g, {});
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('detects CLAUDE.md + run_agent function as agent', () => {
    const g = createKnowledgeGraph();
    g.addNode(createFileNode('CLAUDE.md', 'CLAUDE.md'));
    g.addNode(createFunctionNode('run_agent', 'src/agent.py'));
    const result = detectAgentCode(g, {});
    expect(result.isAgent).toBe(true);
  });

  it('detects subagent pattern in function name', () => {
    const g = createKnowledgeGraph();
    g.addNode(createFunctionNode('spawn_subagent', 'src/orchestrator.py'));
    g.addNode(createFunctionNode('spawn_subagent2', 'src/orchestrator.py', 20));
    const result = detectAgentCode(g, {});
    // Two subagent hits (0.20 + 0.20, capped 0.30) → 0.30 < 0.35 alone
    expect(result.confidence).toBeGreaterThanOrEqual(0.30);
  });

  it('caps confidence at 1.0', () => {
    const g = createKnowledgeGraph();
    g.addNode(createFileNode('CLAUDE.md', 'CLAUDE.md'));
    g.addNode(createFileNode('AGENTS.md', 'AGENTS.md'));
    g.addNode(createFileNode('.mcp.json', '.mcp.json'));
    g.addNode(createFunctionNode('run_agent', 'src/a.py'));
    const fileNode = createFileNode('main.py', 'main.py');
    g.addNode(fileNode);
    const result = detectAgentCode(g, {
      [fileNode.id]: ['anthropic', 'openai', 'langchain'],
    });
    expect(result.confidence).toBeLessThanOrEqual(1.0);
    expect(result.isAgent).toBe(true);
  });

  it('plain React app returns false', () => {
    const g = createKnowledgeGraph();
    g.addNode(createFileNode('App.tsx', 'src/App.tsx'));
    g.addNode(createFunctionNode('render', 'src/App.tsx'));
    const result = detectAgentCode(g, {
      'File:src/App.tsx': ['react', 'react-dom'],
    });
    expect(result.isAgent).toBe(false);
    expect(result.confidence).toBe(0);
  });
});
