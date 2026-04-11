import { describe, it, expect } from 'vitest';
import { kMeans } from '../../src/core/semantic/kmeans';

describe('kMeans', () => {
  it('devuelve array vacío para entrada vacía', () => {
    expect(kMeans([], 3)).toEqual([]);
  });

  it('asigna todos al cluster 0 cuando k=1', () => {
    const points: [number, number, number][] = [[0, 0, 0], [1, 1, 1], [2, 2, 2]];
    const result = kMeans(points, 1);
    expect(result).toHaveLength(3);
    expect(new Set(result).size).toBe(1);
    expect(result[0]).toBe(0);
  });

  it('separa dos clusters claramente distintos', () => {
    const points: [number, number, number][] = [
      [0, 0, 0], [0.1, 0, 0], [0.2, 0, 0],
      [100, 100, 100], [100.1, 100, 100], [100.2, 100, 100],
    ];
    const result = kMeans(points, 2);
    expect(result).toHaveLength(6);
    // Los tres primeros deben estar en el mismo cluster
    expect(result[0]).toBe(result[1]);
    expect(result[1]).toBe(result[2]);
    // Los tres últimos deben estar en el mismo cluster
    expect(result[3]).toBe(result[4]);
    expect(result[4]).toBe(result[5]);
    // Los dos grupos deben ser distintos
    expect(result[0]).not.toBe(result[3]);
  });

  it('limita k al número de puntos si k > n', () => {
    const points: [number, number, number][] = [[0, 0, 0], [1, 1, 1]];
    const result = kMeans(points, 10);
    expect(result).toHaveLength(2);
    expect(new Set(result).size).toBeLessThanOrEqual(2);
  });

  it('devuelve índices en el rango [0, k-1]', () => {
    const points: [number, number, number][] = Array.from({ length: 20 }, (_, i) => [i, 0, 0]);
    const result = kMeans(points, 4);
    expect(result.every(c => c >= 0 && c < 4)).toBe(true);
  });

  it('lanza error si k < 1', () => {
    const points: [number, number, number][] = [[0, 0, 0], [1, 1, 1]];
    expect(() => kMeans(points, 0)).toThrow('kMeans: k debe ser >= 1');
  });
});
