import { describe, it, expect } from 'vitest';
import { cosineSimilarity } from '../../src/core/semantic/cosine';

describe('cosineSimilarity', () => {
  it('devuelve 1 para vectores idénticos', () => {
    const a = new Float32Array([1, 0, 0]);
    expect(cosineSimilarity(a, a)).toBeCloseTo(1.0);
  });

  it('devuelve 0 para vectores ortogonales', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0);
  });

  it('devuelve -1 para vectores opuestos', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([-1, 0, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0);
  });

  it('devuelve 0 si algún vector es cero', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 0, 0]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('funciona con vectores normalizados de múltiples dimensiones', () => {
    const a = new Float32Array([0.6, 0.8, 0]);
    const b = new Float32Array([0.6, 0.8, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0);
  });
});
