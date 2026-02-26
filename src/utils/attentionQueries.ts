import type { PromptAnalysisLayer, SparseAttentionHead } from "../types/report";

function getHeads(layer: PromptAnalysisLayer): SparseAttentionHead[] {
  return layer?.heads ?? [];
}

function getHeadArrays(head: SparseAttentionHead): { q: number[]; k: number[]; w: number[] } {
  return {
    q: head?.query_indices ?? [],
    k: head?.key_indices ?? [],
    w: head?.weights ?? [],
  };
}

/** Which queries attend to a specific key (and with what weight). */
export function getAttentionToToken(
  layer: PromptAnalysisLayer,
  headIdx: number,
  keyIdx: number
): [number, number][] {
  const heads = getHeads(layer);
  if (headIdx < 0 || headIdx >= heads.length) return [];
  const { q, k, w } = getHeadArrays(heads[headIdx]!);
  return q.map((qi, i) => [qi, w[i]!] as [number, number]).filter((_, i) => k[i] === keyIdx);
}

/** Where a specific query attends (and with what weight). */
export function getAttentionFromToken(
  layer: PromptAnalysisLayer,
  headIdx: number,
  queryIdx: number
): [number, number][] {
  const heads = getHeads(layer);
  if (headIdx < 0 || headIdx >= heads.length) return [];
  const { q, k, w } = getHeadArrays(heads[headIdx]!);
  return k.map((ki, i) => [ki, w[i]!] as [number, number]).filter((_, i) => q[i] === queryIdx);
}

/** Top-N strongest connections for a head: [queryIdx, keyIdx, weight], sorted by weight descending. */
export function getTopConnections(
  layer: PromptAnalysisLayer,
  headIdx: number,
  n: number = 10
): [number, number, number][] {
  const heads = getHeads(layer);
  if (headIdx < 0 || headIdx >= heads.length) return [];
  const { q, k, w } = getHeadArrays(heads[headIdx]!);
  if (!w.length) return [];
  const indexed = q.map((qi, i) => [qi, k[i]!, w[i]!] as [number, number, number]);
  indexed.sort((a, b) => b[2] - a[2]);
  return indexed.slice(0, n);
}

/** Heads with basin_score < threshold (U-shape: ignore middle of prompt). Returns [layerIdx, headIdx, score]. */
export function getBasinAnomalies(
  layers: PromptAnalysisLayer[],
  threshold: number = 0.3
): [number, number, number][] {
  const result: [number, number, number][] = [];
  if (!layers) return result;
  for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
    const scores = layers[layerIdx]?.basin_scores ?? [];
    for (let headIdx = 0; headIdx < scores.length; headIdx++) {
      if (scores[headIdx]! < threshold) result.push([layerIdx, headIdx, scores[headIdx]!]);
    }
  }
  return result;
}
