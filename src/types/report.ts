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
    high_entropy_steps?: number;
    repetition_loop_detected?: boolean;
    mid_layer_anomaly_detected?: boolean;
  };
  extensions?: {
    fingerprint?: { prompt_hash?: string; vector?: number[] };
    risk?: { risk_score?: number; risk_factors?: string[]; blamed_layers?: number[] };
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
    /** Dashboard uses this; CoreVital schema also uses top1_top2_margin */
    top_k_margin?: number;
    top1_top2_margin?: number;
    voter_agreement?: number;
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
    };
    hidden_summary?: { l2_norm_mean?: number };
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
