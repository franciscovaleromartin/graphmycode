// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

import { initEmbedder, embedBatch, WebGPUNotAvailableError } from '../embeddings/embedder';
import { EMBEDDABLE_LABELS } from '../embeddings/types';
import type { GraphNode } from 'gitnexus-shared';

/** Un nodo del grafo con su embedding generado. */
export interface SemanticNode {
  nodeId: string;
  label: string;
  name: string;
  embedding: Float32Array;
}

/**
 * Genera una representación textual de un nodo para embedding.
 * Incluye el código fuente si está disponible (primeros 300 chars).
 */
const nodeToText = (node: GraphNode): string => {
  const name = node.properties.name ?? '';
  const filePath = node.properties.filePath ?? '';
  const content = (node.properties as Record<string, unknown>)['content'];
  const snippet = typeof content === 'string' ? content.slice(0, 300) : '';
  return snippet
    ? `${node.label} ${name} in ${filePath}: ${snippet}`
    : `${node.label} ${name} in ${filePath}`;
};

/**
 * Genera embeddings para los nodos embeddables del grafo.
 *
 * - Solo procesa nodos con label en EMBEDDABLE_LABELS (Function, Class, Method, Interface, File).
 * - Reutiliza el singleton del embedder: si el modelo ya está cargado, no se vuelve a descargar.
 * - Los callbacks de progreso se llaman durante la carga del modelo y la generación de embeddings.
 *
 * @param nodes - Todos los nodos del grafo actual
 * @param onModelProgress - Llamado con porcentaje (0-100) durante descarga del modelo
 * @param onEmbeddingProgress - Llamado con (procesados, total) durante embedding
 * @param forceDevice - Forzar 'webgpu' o 'wasm' (para fallback manual)
 * @returns Array de SemanticNode con embeddings, filtrado a EMBEDDABLE_LABELS
 */
export const generateSemanticEmbeddings = async (
  nodes: GraphNode[],
  onModelProgress: (percent: number) => void,
  onEmbeddingProgress: (processed: number, total: number) => void,
  forceDevice?: 'webgpu' | 'wasm',
): Promise<SemanticNode[]> => {
  const embeddable = nodes.filter((n) =>
    EMBEDDABLE_LABELS.includes(n.label as (typeof EMBEDDABLE_LABELS)[number]),
  );

  if (embeddable.length === 0) return [];

  // Inicializar embedder (singleton: si ya está cargado, devuelve instancia cacheada)
  await initEmbedder(
    (progress) => onModelProgress(progress.progress ?? 0),
    {},
    forceDevice,
  );

  const BATCH_SIZE = 16;
  const results: SemanticNode[] = [];

  for (let i = 0; i < embeddable.length; i += BATCH_SIZE) {
    const batch = embeddable.slice(i, i + BATCH_SIZE);
    const texts = batch.map(nodeToText);
    const embeddings = await embedBatch(texts);

    batch.forEach((node, j) => {
      results.push({
        nodeId: node.id,
        label: node.label,
        name: node.properties.name ?? node.id,
        embedding: embeddings[j],
      });
    });

    onEmbeddingProgress(Math.min(i + BATCH_SIZE, embeddable.length), embeddable.length);
  }

  return results;
};

// Re-export para que SemanticGraph no necesite importar de embedder directamente
export { WebGPUNotAvailableError };
