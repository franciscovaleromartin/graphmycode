// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

import { createKnowledgeGraph } from '../core/graph/graph';
import type { PipelineResult, SerializablePipelineResult } from '../types/pipeline';

export const buildPipelineResultFromSerialized = (
  serialized: SerializablePipelineResult,
): PipelineResult => {
  const graph = createKnowledgeGraph();
  serialized.nodes.forEach((node) => graph.addNode(node));
  serialized.relationships.forEach((relationship) => graph.addRelationship(relationship));

  return {
    graph,
    fileContents: new Map(Object.entries(serialized.fileContents)),
  };
};

export const hydrateSerializedServerGraph = async (
  serialized: SerializablePipelineResult,
  loadResult: (result: PipelineResult) => Promise<void>,
): Promise<PipelineResult> => {
  const result = buildPipelineResultFromSerialized(serialized);
  await loadResult(result);
  return result;
};
