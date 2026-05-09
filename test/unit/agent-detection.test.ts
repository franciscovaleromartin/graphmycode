import { describe, expect, it } from 'vitest';
import { createKnowledgeGraph } from '../../src/core/graph/graph';
import { createFileNode, createFunctionNode } from '../fixtures/graph';
import { detectAgentCode } from '../../src/lib/agent-detection';

describe('detectAgentCode', () => {
  // ── Empty / baseline ─────────────────────────────────────────────────────
  it('returns false for an empty graph with no deps', () => {
    const g = createKnowledgeGraph();
    const result = detectAgentCode(g, {});
    expect(result.isAgent).toBe(false);
    expect(result.confidence).toBe(0);
  });

  // ── Single-signal: must NOT trigger isAgent (needs >= 2 categories) ───────
  it('single anthropic import raises confidence but does not trigger isAgent', () => {
    const g = createKnowledgeGraph();
    const fileNode = createFileNode('agent.py', 'src/agent.py');
    g.addNode(fileNode);
    const result = detectAgentCode(g, { [fileNode.id]: ['anthropic'] });
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.isAgent).toBe(false); // only 1 category
  });

  it('single openai import alone does not trigger isAgent', () => {
    const g = createKnowledgeGraph();
    const fileNode = createFileNode('main.py', 'main.py');
    g.addNode(fileNode);
    const result = detectAgentCode(g, { [fileNode.id]: ['openai'] });
    expect(result.isAgent).toBe(false);
  });

  it('single @anthropic-ai/sdk alone does not trigger isAgent', () => {
    const g = createKnowledgeGraph();
    const fileNode = createFileNode('agent.ts', 'src/agent.ts');
    g.addNode(fileNode);
    const result = detectAgentCode(g, { [fileNode.id]: ['@anthropic-ai/sdk'] });
    expect(result.isAgent).toBe(false);
  });

  it('CLAUDE.md alone is not enough (below threshold)', () => {
    const g = createKnowledgeGraph();
    g.addNode(createFileNode('CLAUDE.md', 'CLAUDE.md'));
    const result = detectAgentCode(g, {});
    expect(result.isAgent).toBe(false);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThan(0.55);
  });

  it('AGENTS.md alone raises confidence but does not trigger isAgent', () => {
    const g = createKnowledgeGraph();
    g.addNode(createFileNode('AGENTS.md', 'AGENTS.md'));
    const result = detectAgentCode(g, {});
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.isAgent).toBe(false);
  });

  // ── Two-category combinations that trigger isAgent ────────────────────────
  it('anthropic import + CLAUDE.md triggers isAgent (categories A+B, confidence 0.65)', () => {
    const g = createKnowledgeGraph();
    const fileNode = createFileNode('agent.py', 'src/agent.py');
    g.addNode(fileNode);
    g.addNode(createFileNode('CLAUDE.md', 'CLAUDE.md'));
    const result = detectAgentCode(g, { [fileNode.id]: ['anthropic'] });
    expect(result.isAgent).toBe(true);
    expect(result.confidence).toBeCloseTo(0.65, 5);
  });

  it('openai import + AGENTS.md triggers isAgent (categories A+B)', () => {
    const g = createKnowledgeGraph();
    const fileNode = createFileNode('main.py', 'main.py');
    g.addNode(fileNode);
    g.addNode(createFileNode('AGENTS.md', 'AGENTS.md'));
    const result = detectAgentCode(g, { [fileNode.id]: ['openai'] });
    expect(result.isAgent).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.55);
  });

  it('anthropic import + subagent function triggers isAgent (categories A+D)', () => {
    const g = createKnowledgeGraph();
    const fileNode = createFileNode('agent.py', 'src/agent.py');
    g.addNode(fileNode);
    g.addNode(createFunctionNode('spawn_subagent', 'src/orchestrator.py'));
    g.addNode(createFunctionNode('spawn_subagent2', 'src/orchestrator.py', 20));
    const result = detectAgentCode(g, { [fileNode.id]: ['anthropic'] });
    expect(result.isAgent).toBe(true);
  });

  it('CLAUDE.md + run_agent function: two categories but below confidence threshold', () => {
    const g = createKnowledgeGraph();
    g.addNode(createFileNode('CLAUDE.md', 'CLAUDE.md'));
    g.addNode(createFunctionNode('run_agent', 'src/agent.py'));
    const result = detectAgentCode(g, {});
    // B=0.30, C=0.12 → 0.42 < 0.55 → isAgent: false despite 2 categories
    expect(result.isAgent).toBe(false);
    expect(result.confidence).toBeCloseTo(0.42, 5);
  });

  // ── Minimum 2 categories rule ────────────────────────────────────────────
  it('requires 2 distinct signal categories for isAgent=true', () => {
    const g = createKnowledgeGraph();
    const fileNode = createFileNode('main.py', 'main.py');
    g.addNode(fileNode);
    // Only category A fires, even with multiple frameworks
    const result = detectAgentCode(g, { [fileNode.id]: ['anthropic', 'openai', 'langchain'] });
    expect(result.confidence).toBeGreaterThanOrEqual(0.55);
    expect(result.isAgent).toBe(false); // only 1 category
  });

  // ── Multiple frameworks increase confidence ───────────────────────────────
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

  // ── Frontend framework discount ───────────────────────────────────────────
  it('applies frontend discount for pure UI project without agent signals', () => {
    const g = createKnowledgeGraph();
    const fileNode = createFileNode('App.tsx', 'src/App.tsx');
    g.addNode(fileNode);
    const result = detectAgentCode(g, { [fileNode.id]: ['react', 'react-dom'] });
    expect(result.confidence).toBe(0); // already 0, discount can't go below 0
    expect(result.isAgent).toBe(false);
  });

  it('does not apply frontend discount when agent config file present', () => {
    const g = createKnowledgeGraph();
    const fileNode = createFileNode('App.tsx', 'src/App.tsx');
    g.addNode(fileNode);
    g.addNode(createFileNode('AGENTS.md', 'AGENTS.md'));
    const withDiscount = detectAgentCode(g, { [fileNode.id]: ['react'] });
    const withoutFrontend = detectAgentCode(createKnowledgeGraph(), {});
    // AGENTS.md = 0.30, no discount because config present
    expect(withDiscount.confidence).toBeGreaterThan(withoutFrontend.confidence);
    expect(withDiscount.confidence).toBeCloseTo(0.30, 5);
  });

  it('does not apply frontend discount when orchestration function present', () => {
    const g = createKnowledgeGraph();
    const fileNode = createFileNode('App.tsx', 'src/App.tsx');
    g.addNode(fileNode);
    g.addNode(createFunctionNode('run_agent', 'src/agent.ts'));
    const result = detectAgentCode(g, { [fileNode.id]: ['react'] });
    // C=0.12 (run_agent), no discount → confidence stays 0.12
    expect(result.confidence).toBeCloseTo(0.12, 5);
  });

  it('applies frontend discount when AI import + frontend but no config/orchestration', () => {
    const g = createKnowledgeGraph();
    const fileA = createFileNode('agent.ts', 'src/agent.ts');
    const fileB = createFileNode('App.tsx', 'src/App.tsx');
    g.addNode(fileA);
    g.addNode(fileB);
    // AI import alone = 0.35, with frontend discount = 0.35 - 0.20 = 0.15
    const result = detectAgentCode(g, {
      [fileA.id]: ['anthropic'],
      [fileB.id]: ['react'],
    });
    expect(result.confidence).toBeCloseTo(0.15, 5);
    expect(result.isAgent).toBe(false);
  });

  // ── Confidence cap ────────────────────────────────────────────────────────
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

  // ── System file filtering ─────────────────────────────────────────────────
  it('ignores __MACOSX/ files for config detection', () => {
    const g = createKnowledgeGraph();
    g.addNode(createFileNode('CLAUDE.md', '__MACOSX/project/CLAUDE.md'));
    const result = detectAgentCode(g, {});
    expect(result.confidence).toBe(0);
    expect(result.isAgent).toBe(false);
  });

  it('ignores __MACOSX/ files for import detection', () => {
    const g = createKnowledgeGraph();
    const macNode = createFileNode('agent.py', '__MACOSX/src/agent.py');
    g.addNode(macNode);
    const result = detectAgentCode(g, { [macNode.id]: ['anthropic'] });
    expect(result.confidence).toBe(0);
    expect(result.isAgent).toBe(false);
  });

  it('ignores .DS_Store nodes', () => {
    const g = createKnowledgeGraph();
    g.addNode(createFileNode('.DS_Store', 'src/.DS_Store'));
    g.addNode(createFunctionNode('run_agent', 'src/.DS_Store'));
    const result = detectAgentCode(g, {});
    expect(result.confidence).toBe(0);
  });

  it('real CLAUDE.md (not under __MACOSX) still scores', () => {
    const g = createKnowledgeGraph();
    g.addNode(createFileNode('CLAUDE.md', 'CLAUDE.md'));
    g.addNode(createFileNode('CLAUDE.md', '__MACOSX/CLAUDE.md'));
    const result = detectAgentCode(g, {});
    expect(result.confidence).toBeCloseTo(0.30, 5);
  });

  it('ignores .vscode/ and .idea/ nodes', () => {
    const g = createKnowledgeGraph();
    g.addNode(createFileNode('settings.json', '.vscode/settings.json'));
    g.addNode(createFileNode('workspace.xml', '.idea/workspace.xml'));
    const result = detectAgentCode(g, {});
    expect(result.confidence).toBe(0);
  });
});
