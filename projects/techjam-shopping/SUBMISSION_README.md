# TechJam Submission Package

This archive contains the offline shopping agent and the local configuration
required by the official harness.

## Entry Point

`agent.py` exports the required `Agent` class with `reset(...)` and
`respond(...)` methods.

## Requirements

- Python 3.10 or newer
- Python standard library only
- No network access, API key, or external service

No `pip install` step is required. Place the verified official catalog at
`data/catalog.jsonl`, or provide the catalog path through the harness when it
constructs `Agent`.

## Official Harness

From the repository checkout containing the official local evaluator, run:

```bash
python -m evaluator.local_evaluator
```

The organizer harness should import `Agent` from `agent.py`. The default runtime
configuration is `configs/final.json`.

## Configuration

The optional `SHOPPING_COPILOT_CONFIG` environment variable can point to another
local JSON configuration. The default configuration is fully offline and does not
require any credentials.

## Response Contract

Each response contains a string `message`, an allowed `ask_attribute` or `null`,
an ordered list of valid `parent_asin` recommendations, and non-negative usage
counts. The first 10 valid unique recommendations are scored.

## Report

See `SUBMISSION_REPORT.md` for the method, model choice, limitations, latency,
token usage, and cost disclosure.
