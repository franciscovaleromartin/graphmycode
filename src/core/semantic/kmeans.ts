/** Distancia euclídea al cuadrado entre dos puntos 3D (sin sqrt, solo para comparar). */
const dist2 = (a: [number, number, number], b: [number, number, number]): number => {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
};

/**
 * K-means clustering con algoritmo de Lloyd.
 * @param points - Array de puntos 3D
 * @param k - Número de clusters deseado (se limita a points.length)
 * @param maxIter - Máximo de iteraciones (default 100)
 * @returns Array de índices de cluster (0..k-1), uno por punto
 */
export const kMeans = (
  points: [number, number, number][],
  k: number,
  maxIter = 100,
): number[] => {
  if (points.length === 0) return [];

  const clampedK = Math.min(k, points.length);

  // Inicializar centroides: tomar k puntos equiespaciados del array
  const step = Math.max(1, Math.floor(points.length / clampedK));
  let centroids: [number, number, number][] = Array.from(
    { length: clampedK },
    (_, i) => [points[(i * step) % points.length][0], points[(i * step) % points.length][1], points[(i * step) % points.length][2]],
  );

  let assignments: number[] = new Array(points.length).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    // Asignar cada punto al centroide más cercano
    let changed = false;
    for (let i = 0; i < points.length; i++) {
      let minDist = Infinity;
      let best = 0;
      for (let j = 0; j < clampedK; j++) {
        const d = dist2(points[i], centroids[j]);
        if (d < minDist) {
          minDist = d;
          best = j;
        }
      }
      if (assignments[i] !== best) {
        assignments[i] = best;
        changed = true;
      }
    }
    if (!changed) break;

    // Recalcular centroides
    const sums: [number, number, number][] = Array.from({ length: clampedK }, () => [0, 0, 0]);
    const counts = new Array(clampedK).fill(0);
    for (let i = 0; i < points.length; i++) {
      const c = assignments[i];
      sums[c][0] += points[i][0];
      sums[c][1] += points[i][1];
      sums[c][2] += points[i][2];
      counts[c]++;
    }
    centroids = sums.map((s, c) =>
      counts[c] > 0
        ? [s[0] / counts[c], s[1] / counts[c], s[2] / counts[c]]
        : centroids[c],
    ) as [number, number, number][];
  }

  return assignments;
};
