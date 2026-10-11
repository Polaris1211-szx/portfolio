# Folio — AI Accounting Document Collection and Review Agent

Folio addresses a practical accounting-firm workflow problem: monthly supporting documents are scattered across email and folders, missing evidence requires repeated follow-up, and accountants spend time checking identities, periods, amounts, and cross-document relationships.

The system closes this loop from request creation and client upload to AI-assisted classification, evidence review, targeted follow-up, and accountant confirmation.

## System snapshot

- Agent service for PDF and image understanding, OCR, classification, structured review, and cited evidence.
- FastAPI business backend with asynchronous workers, PostgreSQL, Redis, authorisation, workflow state, and validation.
- Vue 3 / TypeScript client and accountant workspaces.
- Read-only Agent proposals separated from backend business writes and human approval.
- Decimal-based checks for monetary relationships before a decision is applied.

## Dataset and model work

- Generated a synthetic evaluation dataset of 2,000 cases across 100 companies and 12 accounting scenario families.
- Covered English, Chinese, Malay, and mixed-language cases with more than 12,000 evidence files and distractor documents.
- Participated in SFT and DAPO training and tuning for the Folio-Reasoner model.
- Reproduced the OpenAI-compatible model API integration and validated the end-to-end request format.
- On the fixed FolioBench-120 test set, the trained checkpoint reached 65.8%, compared with 56.7% for the teacher baseline (+9.2 percentage points). This is a held-out model evaluation result, not a claim of live product accuracy.

## Source layout

```text
overview/   project overview and demo materials
agent/      OCR, classification, model client, and review logic
backend/    FastAPI service, workflow, worker, and deployment configuration
frontend/   Vue 3 / TypeScript client and accountant workspaces
```

## Original repositories

- Overview: https://github.com/multi-mind-nus/folio
- Agent: https://github.com/multi-mind-nus/acc-system-agent
- Backend: https://github.com/multi-mind-nus/acc-system-backend
- Frontend: https://github.com/multi-mind-nus/acc-system-frontend
