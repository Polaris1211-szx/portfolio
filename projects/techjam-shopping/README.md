# TechJam Conversational Shopping Agent

An offline-first, multi-turn shopping agent designed for a 50,000-item product catalog. The agent tracks changing user intent, retrieves a broad candidate set, ranks products with evidence, and decides whether to recommend or ask a high-value follow-up question.

## Technical approach

- BM25 retrieval for lexical matching.
- Query variants and category anchors to reduce candidate loss when product descriptions and user wording differ.
- Reciprocal Rank Fusion (RRF) to combine multiple retrieval routes.
- Evidence-aware reranking across category match, attribute coverage, route consensus, and soft budget constraints.
- Explicit handling of `MATCH`, `UNKNOWN`, and `CONFLICT` instead of discarding products with missing metadata.
- Deterministic offline evaluation with no model-token cost.

## Personal contribution

Optimised candidate retrieval and ranking. The work focused on preventing relevant products from being removed too early and promoting products that had stronger multi-route and attribute evidence. On the public 200-session benchmark, the final system reached Hit Rate@10 = 1.000 and MRR = 0.9537.

## Run

```bash
pip install -r requirements.txt
python -m evaluator.local_evaluator
```

## Original repository

https://github.com/vepharix/techjam-conversational-search
