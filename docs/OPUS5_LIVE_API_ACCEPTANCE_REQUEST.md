# OPEN DOOR TOKYO — Opus 5 Live API Acceptance Review

You are an independent evaluator. Inspect the repository read-only. Do not edit
files, deploy, call a partner API, reveal or search for credential values, or
spend sponsor credits.

## Product goal

OPEN DOOR TOKYO converts a short guided venue video into a bilingual,
evidence-backed pre-visit Access Card. It must never certify universal
accessibility. Observations, staff measurements, and unknown facts stay
distinct. A human must explicitly approve publication.

## Required references

Read:

- `docs/HACKATHON_API_INTEGRATION_CONSTRAINTS.md`
- `docs/OPUS5_LIVE_API_REDESIGN.md`
- `docs/API_CONNECTION_STATUS.md`
- `docs/SPONSOR_INTEGRATIONS.md`
- `docs/RUNBOOK.md`
- `README.md`
- `.env.example`
- `package.json`
- `app/`
- `components/`
- `lib/`
- `scripts/`
- `tests/`

Production URL: `https://open-door-tokyo.vercel.app`

## Evidence claimed by the implementer

Do not trust these claims without matching source or test evidence:

- deterministic/unit suite: 74/74 passed;
- production Playwright suite: 8/8 passed on desktop and mobile;
- TypeScript and production build: passed;
- production dependency audit: zero vulnerabilities;
- deployment `dpl_9be82ZZyhh7ySv63EQ4wAFVyiYWp`: READY;
- production sample capture → review → signed human approval → publish → public
  card was browser-verified with no console errors;
- production error-level and HTTP 500 log scans returned no matching entries;
- five official read-only authentication checks succeeded once and sequentially
  without generation: ai&, Daytona, GMI Cloud, Nosana, and Qoder;
- Qwen made no request because its region/workspace/base/model tuple was absent;
- all billable/generation provider tests remain NOT RUN because the exact
  non-secret cost/model/hard-limit tuple was not available.

## Binary gates

1. The implementation follows the Hackathon API Integration constraints:
   exact credential discovery, no secret output, fail-closed cost controls,
   one billable call at a time, no automatic retry/top-up/provider switching,
   durable create-only reservation, and unknown reconciliation.
2. Qwen, GMI Cloud, ai&, Daytona, and Nosana have distinct code-level roles and
   closed contracts. Qoder is described honestly as developer tooling.
3. The default/demo path cannot accidentally make a paid request.
4. Live contracts are explicitly gated and cannot run without a ready credit
   guard.
5. Qwen validates region/workspace/model, payload bounds, schema, semantics,
   model identity, and usage.
6. Daytona deletes its one sandbox in `finally` and treats unknown lifecycle as
   fail-closed.
7. Nosana connection proof is read-only; any paid job path is isolated behind
   explicit confirmation, quote, cap, hard limit, idempotency, and reservation.
8. Provider errors, traces, and the purpose-scoped read-only preflight do not
   expose raw upstream messages, secrets, or response bodies. The preflight has
   bounded timeouts, no retry, no mutation, and one provider secret per child.
9. Sample, LIVE, FALLBACK, and NOT CONFIGURED states are not conflated, and
   qualitative provenance replaces uncalibrated confidence percentages.
10. Real uploads fail closed and never inherit demo facts or frames.
11. Human approval is card-bound and expiring; publish rejects missing approval
    and unresolved required facts.
12. Documentation distinguishes local read-only authentication success,
    production configuration, and billable/generation proof without conflating
    them.

## Output

Return only a concise Markdown report with:

- `VERDICT: PASS` only if no required blocker remains, otherwise
  `VERDICT: FAIL`;
- a 12-row PASS/FAIL table with concrete file paths and symbols;
- critical blockers, if any;
- at most five non-blocking improvements;
- one skeptical senior objection and a concrete response;
- confidence: high, medium, or low.
