# MyServicer — doc map

Start here. One-line summary of every doc an agent or developer might need.

| File | What it covers |
|------|----------------|
| [`CLAUDE.md`](../CLAUDE.md) | Session rules, permission policy, coding rules, agent coordination |
| [`TODO.md`](../TODO.md) | Current task checklist — single source of truth for task state |
| [`docs/ai-context/ceo-overview.md`](ai-context/ceo-overview.md) | CEO/orchestrator decisions (§10–§19), parity evidence, strategic rationale |
| [`docs/ai-context/money-listing-epic-spec.md`](ai-context/money-listing-epic-spec.md) | Consolidated build spec: payment + tax/itemized + pricing modules + listing form + calc fixes |
| [`docs/ai-context/calculation-audit.md`](ai-context/calculation-audit.md) | Money-flow trace, worked sample, button→effect map, calculation inconsistencies + fixes |
| [`docs/ai-context/orchestration-plan.md`](ai-context/orchestration-plan.md) | 2 Claude (plan+QA) + 3 Kilo (execute): roles, workflow, branch/push rules |
| [`docs/ai-context/schema-notes.md`](ai-context/schema-notes.md) | DB models, fields, relations, indexes |
| [`docs/api-reference/api-doc.md`](api-reference/api-doc.md) | Route contracts, request/response shape, auth headers |
| [`docs/ai-context/security-notes.md`](ai-context/security-notes.md) | Auth, JWT, rate limits, uploads, money rules |
| [`docs/setup-guides/INSTRUCTIONS.md`](setup-guides/INSTRUCTIONS.md) | Dev setup, daily startup, commands, env vars, Docker, common issues |
| [`docs/setup-guides/PRODUCTION-GO-LIVE.md`](setup-guides/PRODUCTION-GO-LIVE.md) | Production deployment checklist — Stripe, HTTPS, env vars, domain config |
| [`docs/ai-context/tech-stack.md`](ai-context/tech-stack.md) | Library choices, versions, why each was picked |
| [`docs/ai-context/seed-plan.md`](ai-context/seed-plan.md) | Demo accounts, seed data, reseed commands |

## Agent logs

All logs live in [`docs/ai-context/logs/`](ai-context/logs/).

| Log | Writer |
|-----|--------|
| [`ceo-log.md`](ai-context/logs/ceo-log.md) | CEO/Orchestrator |
| [`backend-log.md`](ai-context/logs/backend-log.md) | Backend agent |
| [`frontend-log.md`](ai-context/logs/frontend-log.md) | Frontend agent |
| [`qa-log.md`](ai-context/logs/qa-log.md) | QA agent |
| [`devops-log.md`](ai-context/logs/devops-log.md) | DevOps agent |
| [`SESSION-HANDOFF.md`](ai-context/logs/SESSION-HANDOFF.md) | Session handoff notes |

## Archive (read-only history)

[`docs/ai-context/archive/`](ai-context/archive/) — frozen bug/contract history and completed task history. Never modify.
