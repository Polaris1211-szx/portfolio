# Submission Report

## Method

This submission is a deterministic, fully offline conversational shopping agent.
It keeps the official `Agent` interface unchanged and separates the runtime into
the following stages:

1. Rule-based conversation state tracking with support for accumulated
   preferences and intent overrides.
2. Query planning for buying and browsing requests.
3. SQLite FTS5/BM25 candidate retrieval with a full-category anchor and a stable
   hybrid fusion boundary.
4. Deterministic evidence ranking with exact-match, field-token, anchor, route-
   consensus, and soft-budget signals.
5. Information-gain clarification and stagnation-aware candidate coverage.
6. Strict response construction for the official evaluator schema.

The default configuration is `configs/final.json`. The terminal decision view is
debug-only and does not change the response returned to the evaluator.

## Model Choice and External Services

The submitted agent does not call an LLM, remote API, database service, or other
external service. It uses only the Python standard library and the local catalog.
No credentials or environment-specific services are required.

## Usage, Latency, and Cost Disclosure

- Prompt tokens per turn: `0`
- Completion tokens per turn: `0`
- Estimated model cost: `$0`
- One-time catalog initialization: approximately `2.85 s`
- Response latency: approximately `54.5 ms per turn` in a three-turn local
  smoke test over the 50,000-product catalog

The latency figures were measured on the development machine and will vary with
hardware, Python version, catalog storage, and process reuse. Catalog indexing is
performed once when the agent is initialized; subsequent turns reuse the index.

## Reproducibility

- Python: `3.10+`
- Dependencies: Python standard library only; no package installation is needed.
- Catalog: place the verified official catalog at `data/catalog.jsonl`, or pass
  its path to `Agent` through the official harness.
- Configuration: `configs/final.json` is selected by default. The
  `SHOPPING_COPILOT_CONFIG` environment variable may select another local config.
- Local official-harness command:

  ```bash
  python -m evaluator.local_evaluator
  ```

The entry point is `agent.py` in the submission archive and exports `Agent`.

## Limitations

- The agent uses lexical and rule-based signals, so it may miss paraphrases,
  implicit preferences, or nuanced product intent.
- Retrieval quality depends on the fields available in the frozen catalog.
- The offline design does not use semantic embeddings or an LLM to resolve
  ambiguous language.
- Public-set metrics are development evidence only and do not guarantee private
  evaluation performance.

## Public Development Snapshot

Using the 200-session public set, the E27 `configs/final.json` produced:

- Hit Rate@10: `1.000`
- MRR: `0.953667`
- MTTC: `2.215`
- Recommended technical score: `0.961800`
