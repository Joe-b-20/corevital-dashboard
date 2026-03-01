/** CoreVital report JSON shape (minimal for dashboard). */
export interface CoreVitalReport {
  trace_id?: string;
  schema_version?: string;
  model?: {
    hf_id?: string;
    architecture?: string;
    num_layers?: number;
    hidden_size?: number;
    num_attention_heads?: number;
    device?: string;
    dtype?: string;
    quantization?: { enabled?: boolean; method?: string | null };
  };
  summary?: {
    generated_tokens?: number;
    elapsed_ms?: number;
    total_steps?: number;
    prompt_tokens?: number;
  };
  prompt?: { text?: string; num_tokens?: number };
  generated?: { output_text?: string };
  run_config?: {
    generation?: { temperature?: number; top_k?: number; top_p?: number };
    seed?: number;
    max_new_tokens?: number;
  };
  health_flags?: {
    nan_detected?: boolean;
    inf_detected?: boolean;
    attention_collapse_detected?: boolean;
    attention_collapse_severity?: number;
    high_entropy_steps?: number;
    repetition_loop_detected?: boolean;
    mid_layer_anomaly_detected?: boolean;
  };
  extensions?: {
    fingerprint?: { prompt_hash?: string; vector?: number[]; version?: number };
    risk?: {
      risk_score?: number;
      risk_factors?: string[];
      blamed_layers?: BlamedLayer[] | number[];
      blamed_layers_flat?: number[];
      attention_collapse_detail?: AttentionCollapseDetail;
    };
    early_warning?: { failure_risk?: number; warning_signals?: string[] };
    rag?: {
      context_token_count?: number;
      retrieved_doc_ids?: string[];
      retrieved_doc_titles?: string[];
      retrieval_metadata?: unknown;
    };
    narrative?: { summary?: string };
    performance?: {
      total_wall_time_ms?: number;
      total_ms?: number;
      unaccounted_time?: { ms?: number; pct?: number };
      parent_operations?: Array<{ name?: string; ms?: number; pct?: number }> | Record<string, { ms?: number; pct?: number }>;
      detailed_breakdown?: { breakdown?: Record<string, unknown> };
      detailed_file?: string;
      original_model_load_ms?: number;
      warmup_ms?: number;
      baseline_ms?: number;
      instrumented_inference_ms?: number;
      inference_overhead_ms?: number;
      inference_overhead_pct?: number;
      corevital_overhead_ms?: number;
      corevital_overhead_pct?: number;
    };
    compound_signals?: CompoundSignal[];
    calibration?: CalibrationExtension;
    metric_consistency?: MetricConsistencyExt;
  };
  timeline?: TimelineStep[];
  prompt_analysis?: {
    layer_transformations?: number[];
    prompt_surprisals?: number[];
    layers?: PromptAnalysisLayer[];
  };
}

/** One layer in prompt_analysis with sparse attention heads. */
export interface PromptAnalysisLayer {
  basin_scores?: number[];
  heads?: SparseAttentionHead[];
}

export interface SparseAttentionHead {
  query_indices?: number[];
  key_indices?: number[];
  weights?: number[];
}

export interface TimelineStep {
  step_index: number;
  token?: { token_text?: string };
  logits_summary?: {
    entropy?: number;
    perplexity?: number;
    surprisal?: number;
    top_k_margin?: number;
    top1_top2_margin?: number;
    /** @deprecated Use topk_mass instead */
    voter_agreement?: number;
    topk_mass?: number;
    /** @deprecated Use topk_probs instead */
    topk?: TopKItem[];
    topk_probs?: TopKItem[];
  };
  layers?: Array<{
    attention_summary?: {
      entropy_mean?: number;
      entropy_min?: number;
      entropy_max?: number;
      concentration_max?: number;
      concentration_min?: number;
      collapsed_head_count?: number;
      focused_head_count?: number;
      entropy_mean_normalized?: number;
      collapsed_head_rate?: number;
    };
    hidden_summary?: {
      l2_norm_mean?: number;
      clipped?: boolean;
      clip_fraction?: number;
      clip_max_before?: number;
    };
  }>;
}

export interface TraceRow {
  trace_id: string;
  created_at_utc: string;
  model_id: string;
  schema_version?: string;
  prompt_hash?: string | null;
  risk_score?: number | null;
}

export interface TopKItem {
  token_id: number;
  token_text: string;
  prob: number;
}

export interface BlamedLayer {
  layer: number;
  reasons: string[];
  severity: number;
}

export interface CompoundSignal {
  name: string;
  description: string;
  severity: number;
  evidence: string | string[];
}

export interface CalibrationExtension {
  divergence_score?: number;
  anomalies?: string[];
  baseline_model_id?: string;
  baseline_num_runs?: number;
}

export interface MetricConsistencyExt {
  warnings?: string[];
  count?: number;
}

export interface AttentionCollapseDetail {
  mean_collapse_rate?: number;
  trend_detected?: boolean;
  trend_peak_deviation?: number;
  trend_layers?: number[];
  catastrophic?: boolean;
  calibration_anomaly?: boolean;
  calibration_anomaly_layers?: number[];
  per_layer_mean_collapse_rate?: number[];
}

export function isEnrichedBlamedLayers(
  bl: BlamedLayer[] | number[] | undefined
): bl is BlamedLayer[] {
  if (!bl || bl.length === 0) return false;
  return typeof bl[0] === "object" && "layer" in (bl[0] as BlamedLayer);
}
