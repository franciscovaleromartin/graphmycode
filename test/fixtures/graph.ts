import type { GraphNode, GraphRelationship } from '../../src';

export function createFileNode(
  name: string,
  filePath: string,
  opts: Partial<GraphNode> = {},
): GraphNode {
  return {
    id: name,
    label: 'File' as const,
    name,
    filePath,
    content: opts.content ?? `// ${name}`,
    startLine: opts.startLine ?? 1,
    endLine: opts.endLine ?? 10,
    isExported: opts.isExported ?? false,
    heuristicLabel: opts.heuristicLabel,
    keywords: opts.keywords,
    description: opts.description,
    enrichedBy: opts.enrichedBy,
    cohesion: opts.cohesion,
    symbolCount: opts.symbolCount ?? 0,
  };
}

export function createFunctionNode(
  name: string,
  filePath: string,
  startLine: number,
  endLine: number,
  isExported: boolean,
  opts: Partial<GraphNode> = {},
): GraphNode {
  return {
    id: name,
    label: 'Function' as const,
    name,
    filePath,
    content: opts.content ?? `function ${name}() {}`,
    startLine,
    endLine,
    isExported,
    heuristicLabel: opts.heuristicLabel,
    keywords: opts.keywords,
    description: opts.description,
    enrichedBy: opts.enrichedBy,
    cohesion: opts.cohesion,
    symbolCount: opts.symbolCount ?? 1,
  };
}



