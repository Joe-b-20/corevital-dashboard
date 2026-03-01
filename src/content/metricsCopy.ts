/**
 * Explanatory copy and formulas aligned with CoreVital docs:
 * - README Glossary (https://github.com/Joe-b-20/CoreVital)
 * - docs/metrics-interpretation.md
 * Written for anyone with basic LLM understanding.
 */

export const METRIC_GUIDE = {
  intro:
    "CoreVital records what your model does inside each generation step (confidence, attention, hidden states) so you can spot confusion, repetition, or numerical issues without reading raw logs.",

  healthFlags: {
    title: "Health flags (top-level summary)",
    items: [
      "NaN/Inf: Any “not a number” or infinity in the model’s internals → stop and debug (bad inputs, precision, or code).",
      "Attention collapse: Three-component detection: (1) collapse rate increasing during generation (trend), (2) mean rate > 70% (catastrophic), (3) anomalous vs calibration baseline. Structural heads not flagged. Severity 0–0.8.",
      "High entropy steps: Steps with entropy above model-specific threshold (default 4.0; GPT-2: 5.0, LLaMA: 3.5). A few normal; many = confusion.",
      "Repetition loop: Last-layer hidden states became nearly identical over 3+ steps (cosine similarity > 0.9995 by default) → model may be stuck repeating.",
      "Mid-layer anomaly: Unusual values (NaN/Inf or L2 norm explosion in the middle third of layers) → possible numerical or training issue.",
    ],
  },

  riskScore:
    "Composite risk score (0–1) from: boolean flags (NaN/Inf, repetition), continuous metrics (entropy, margin, top-K mass, surprisal), and compound signal severities. < 0.3 low; 0.3–0.7 moderate; > 0.7 high.",

  entropy: {
    meaning: "“Shannon entropy of the next-token distribution. Range: 0 to ~16–17 bits for typical LLMs. “How unsure was the model when it picked this token?” < 2 very confident (one dominant token); 2–4 normal (several plausible options); > 4 high uncertainty, possible confusion. Red dashed line at 4.0. Timeline charts show missing values as gaps (not zero). Sudden spikes can mean lost context or weird input.",
    formula: "H = −Σ pᵢ log₂(pᵢ) (Shannon entropy in bits).",
  },
  perplexity: {
    meaning:
      "2^entropy; effective number of equiprobable tokens the model is choosing among. Same information as entropy in a different scale. Low (e.g. 1–4) = confident; high (e.g. > 16) = very uncertain.",
    formula: "Perplexity = 2^entropy",
  },
  surprisal: {
    meaning:
      "How surprised the model was by the token it actually produced (−log₂ of its probability). < 2 = token was expected; 2–5 = plausible but not top choice; > 5 = model was surprised. Spikes show where the model struggled.",
    formula: "Surprisal = −log₂ p(token)",
  },
  topKMargin: {
    meaning: "Difference between the top token’s probability and the second-most likely. Small margin = model was close to choosing another token; large margin = confident pick.",
    formula: "Top-K margin = p₁ − p₂ (top minus second probability)",
  },
  topkMass: {
    meaning:
      "Sum of probabilities of the top-K tokens (default K=10). High = most mass on a small set of candidates; low = spread across many tokens. Formerly 'voter agreement'.",
    formula: "Top-K mass = Σ p(top-K tokens)",
  },

  attentionHeatmaps:
    "Per layer and step: Entropy mean/min/max = how spread out attention is (very low ≈ collapse). Concentration max = maximum attention weight any single token receives from a query in a head (high concentration > 0.5 = focused; > 0.95 = potential attention collapse). Collapsed head count = entropy < 0.1; focused head count = concentration > 0.9.",

  /** Per-metric explanation for attention heatmap dropdown. */
  attentionHeatmapMetrics: {
    "attention_summary.entropy_mean": {
      what: "Average entropy of attention weights over keys, per layer and generation step. Measures how spread out attention is across positions.",
      how: "For each layer and step we take the mean of −Σ p log₂(p) over attention heads; low values (< 0.1) indicate collapse (one position got almost all weight).",
    },
    "attention_summary.concentration_max": {
      what: "Maximum weight on any single position, per layer and step. Shows the strongest single attention link.",
      how: "Per head we take max(attention_weights); then we take the max across heads in that layer/step. Near 1.0 = one position ate almost all attention.",
    },
    "attention_summary.collapsed_head_count": {
      what: "Number of attention heads in that layer/step with entropy below 0.1 (collapsed onto one position).",
      how: "We count heads where entropy over keys < 0.1. High counts can indicate unhealthy attention patterns.",
    },
    "attention_summary.focused_head_count": {
      what: "Number of heads with concentration above 0.9 (very focused on one position).",
      how: "We count heads where max(attention_weights) > 0.9. Complements collapsed head count.",
    },
    "attention_summary.entropy_mean_normalized": {
      what: "Normalized attention entropy (entropy / log(K)), in [0,1]. Comparable across models with different vocabulary sizes.",
      how: "entropy_mean / log(K) where K is sequence length. Collapse threshold: < 0.03.",
    },
    "attention_summary.collapsed_head_rate": {
      what: "Fraction of heads collapsed (normalized entropy < 0.03). In [0,1]. Comparable across models with different head counts.",
      how: "collapsed_head_count / num_heads. A rate of 0 = no collapse; approaching 1 = nearly all heads collapsed.",
    },
  } as Record<string, { what: string; how: string }>,

  l2Norms:
    "Size of the vectors the model passes between layers. Normal = stable range (model-dependent). Very high can mean activations blowing up; very low can mean dying activations. Look for sudden jumps or odd patterns by layer/step.",
  l2HeatmapWhat: "Mean L2 norm of hidden-state vectors after each layer, per generation step. One cell = one (layer, step).",
  l2HeatmapHow: "We take the hidden state at that layer/step, compute its L2 norm, and average over the batch. Values are model-dependent; look for stability and absence of spikes.",

  /** Clarification: Sparse Attention vs Basin score (for Prompt analysis section). */
  promptAnalysisConcepts: {
    sparseAttention:
      "Sparse attention is the way CoreVital stores attention from the prompt pass: instead of full matrices, we keep (query_index, key_index, weight) triples per head. " +
      "That lets us compute metrics and query “who attends to whom” without huge payloads. The Sparse Attention tab shows data from this pass.",
    basinScore:
      "Basin score is one metric we compute from that attention. For each head we take the middle third of the prompt (keys) and the two boundary thirds (start + end), " +
      "and compute: (attention on middle) / (attention on boundaries). So: < 0.3 = head under-uses the middle (“lost in the middle”); ~0.5 = balanced; > 1.5 = head focuses more on the middle. " +
      "We show it as a heatmap (layers × heads) and per-head bars. So: Sparse Attention = the tab and data format; Basin score = the metric and the graphs in that tab.",
  },

  promptAnalysis: {
    layerTransforms:
      "Geometric change between consecutive layers: ratio of L2 norms (magnitude change) and cosine similarity (direction change) between layer N and layer N+1. Healthy models usually show moderate change (e.g. 0.2–0.5). Large magnitude jumps or sharp direction changes can indicate layers where the model “makes decisions.”",
    layerTransformsHow: "Cosine similarity and optionally L2 norm ratio between hidden states of consecutive layers on the prompt pass.",
    promptSurprisals:
      "How “surprised” the model was by each prompt token. High values = model found that part of the prompt unusual or hard.",
    promptSurprisalsHow: "Surprisal = −log₂ p(token) for each prompt token in the extra prompt-only pass.",
    basinScore:
      "Per-head ratio: middle-third attention / boundary-thirds attention. < 0.3 = “lost in the middle”; ~0.5 = balanced; > 1.5 = head focuses more on middle than boundaries.",
    basinFormula: "Basin score = (attention on middle third) / (attention on first + last third).",
    sparseAttention:
      "Data from the prompt-only pass: per-layer, per-head we store attention in sparse form (query/key/weight triples). The main visualization here is the basin score (middle vs boundary attention). Low basin (&lt;0.3) = “lost in the middle”; ~0.5 = balanced. Use Attention Explorer to query which positions attend where.",
    sparseAttentionHow: "Basin score = (avg attention on middle third of keys) / (avg attention on first+last third), per head. Attention is stored sparsely; basin is computed before sparsifying. Heatmap and bars show this ratio per layer/head.",
    attentionExplorer:
      "Query sparse attention: which positions attend to a key, or where a query attends. Top-10 connections and basin anomalies (score < 0.3) for this head.",
    attentionExplorerHow: "We read stored per-head (query_idx, key_idx, weight) from the prompt pass; basin anomalies are heads with basin_score < 0.3.",
  },

  performance: {
    what: "Where time was spent: model load, tokenization, generation, and report building. Use this to see what dominates (e.g. load vs actual generation). With perf detailed, a separate JSON has per-operation breakdowns.",
    totalWallTime: "Elapsed time from run start to finish (ms). Includes all operations and any gaps between them.",
    parentOps: "High-level phases (e.g. model_load, tokenize, model_inference, report_build). Each phase’s duration and share of total are measured from the instrumentation tree.",
    unaccounted: "Total wall time minus the sum of parent operation times (and in strict mode, minus warmup and baseline). Represents gaps between operations or time not attributed to a tracked phase.",
    strict: {
      originalModelLoad: "Time to load the model once (cold load); not counted in inference.",
      warmup: "Optional warmup run before timing; excluded from total and baseline.",
      baseline: "Raw inference time with no CoreVital instrumentation (reference).",
      instrumentedInference: "Inference time with CoreVital hooks enabled.",
      inferenceOverhead: "Instrumented inference − baseline; percentage = (overhead / baseline) × 100.",
      corevitalOverhead:
        "Sum of all tracked operations except model_load and tokenize, minus baseline. Percentage = (corevital_overhead_ms / baseline) × 100.",
    },
  },

  coloredOutput:
    "Generated text colored by per-token entropy: green = low uncertainty, yellow = medium, red = high.",

  rag: "This run was executed with retrieval-augmented context. Use this to correlate behavior with context length or source documents.",
  earlyWarning: "Failure risk and signals derived from timeline (entropy trend, repetition, etc.). Use for triage.",
  earlyWarningSignals:
    "Signal names: entropy_accelerating (entropy second derivative positive), margin_collapsed (top-K margin near zero), margin_declining (margin trending down), surprisal_volatile (surprisal standard deviation high), entropy_margin_divergence (entropy rising while margin not falling — unusual). Plus repetition_loop, mid_layer_anomaly, attention_collapse.",
  riskWhat: "Composite risk score (0–1) from: boolean flags (NaN/Inf, repetition), continuous metrics (entropy, margin, top-K mass, surprisal), and compound signal severities. < 0.3 low; 0.3–0.7 moderate; > 0.7 high. Blamed layers = layers with anomalies, attention collapse, or compound signals.",
  compoundSignals:
    "Multi-metric failure patterns. Signals: context_loss (entropy + low margin + attention collapse), confident_confusion (low entropy but high surprisal), degenerating_generation (rising entropy + declining margin), attention_bottleneck (collapse + high surprisal), confident_repetition_risk (low entropy + repetition pattern). Each has severity (0–1) and evidence text.",
  calibration:
    "Compares this run against a baseline profile. Divergence score (0–1) measures deviation from baseline behavior. Anomalies list specific deviations. Present only when a calibration profile is configured.",
};
