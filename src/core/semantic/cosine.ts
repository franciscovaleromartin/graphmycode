/**
 * Similitud coseno entre dos vectores de embedding.
 * Devuelve un valor en [-1, 1] donde 1 = dirección idéntica.
 * Devuelve 0 si algún vector es el vector cero.
 */
export const cosineSimilarity = (a: Float32Array, b: Float32Array): number => {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
};
