import { UMAP } from 'umap-js';

/**
 * Reduce embeddings de alta dimensión a coordenadas 3D usando UMAP.
 *
 * - Requiere mínimo 3 puntos (nNeighbors >= 2).
 * - Con < 3 puntos devuelve posiciones en círculo unitario (fallback).
 * - La llamada a umap.fit() es síncrona y puede tardar varios segundos
 *   con muchos nodos; llamar desde un estado de "cargando" en la UI.
 *
 * @param embeddings - Array de vectores de embedding (Float32Array)
 * @returns Array de puntos [x, y, z]
 */
export const reduceToThreeD = (embeddings: Float32Array[]): [number, number, number][] => {
  if (embeddings.length === 0) return [];

  const n = embeddings.length;

  // UMAP necesita al menos nNeighbors + 1 puntos
  const nNeighbors = Math.max(2, Math.min(15, n - 1));

  if (n < 3) {
    // Fallback: distribuir en círculo unitario
    return embeddings.map((_, i) => {
      const angle = (i / Math.max(n, 1)) * 2 * Math.PI;
      return [Math.cos(angle), Math.sin(angle), 0];
    });
  }

  const data = embeddings.map((e) => Array.from(e));

  const umap = new UMAP({
    nComponents: 3,
    nNeighbors,
    minDist: 0.1,
    spread: 1.0,
  });

  const result = umap.fit(data) as number[][];
  return result.map((p) => [p[0], p[1], p[2]] as [number, number, number]);
};
