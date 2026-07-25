# OPEN DOOR TOKYO — Opus 5 Live API Redesign Request

## Role

Act as the Planner. Produce a revised, implementation-ready design for connecting and proving the actual Agent Forge partner APIs. Do not edit code, deploy, expose secrets, or make paid API calls.

## Current product

Repository: `/Users/b/Documents/codex 2/open-door-tokyo`

Live app: `https://open-door-tokyo.vercel.app`

Current flow:

1. Capture a 20-second venue walkthrough or use the included sample.
2. Extract four evidence frames.
3. Qwen structures observations and unknowns.
4. Deterministic rules plus GMI block unsupported accessibility claims.
5. Venue staff enter measured facts and attest.
6. ai& checks bilingual wording.
7. Daytona audits the card in a sandbox.
8. A signed ten-minute approval permits publication.
9. A bilingual public Access Card is saved in private Vercel Blob storage.
10. Nosana has a separately guarded GPU-job submission path.

Current verified baseline:

- 47 unit tests pass.
- 6 Playwright tests pass locally and on production.
- Production build passes.
- Production dependency audit reports zero vulnerabilities.
- Private Blob storage is configured.
- Opus 5 previously returned PASS after fail-closed real-upload repairs.

Current credential evidence:

- Local `.env.local` contains only `VERCEL_OIDC_TOKEN`.
- Vercel contains `BLOB_READ_WRITE_TOKEN` and `PUBLISH_SIGNING_SECRET`.
- `/api/health/providers` currently reports Qwen, GMI, ai&, Nosana, and Daytona as not configured.
- The user says the partner APIs have now been prepared, but their secure source/location is not yet resolved.

## User request

1. Redesign the implementation around actual partner APIs.
2. Run real connection tests.
3. Implement in parallel with GPT-5.6-sol fast mode.
4. Preserve a working live demo and honest LIVE/FALLBACK/NOT CONFIGURED reporting.

## Hard constraints

- Never print, log, commit, copy into docs, or send raw API keys to any model.
- Secrets may be injected only through a local ignored env file, an OS secret store, or encrypted Vercel environment variables.
- Do not inspect secret values merely to prove that they exist.
- One minimal inference call maximum per metered LLM provider during connection proof; no automatic retry.
- Daytona may create at most one ephemeral sandbox and must delete it.
- Nosana must not submit a paid GPU job merely for connectivity. Prefer authenticated read-only status/list checks; only use an existing job ID if available.
- Never represent a provider as LIVE unless a current validated response affected the result.
- A provider failure must leave a truthful trace and fail closed. Real uploads may never borrow sample facts or sample frames.
- Preserve the accepted visual identity and three-screen demo. Add UI only when it materially improves live-evidence honesty.
- Do not weaken the human approval gate.
- Do not publish any real venue without explicit human approval.

## Brain rulings — do not change without reporting a conflict

<!-- brain-driver: engineer-brain owner-judgment + api-backend + testing; uiux-brain owner-judgment + cross-domain-rulings + ai-llm-ux + states-lifecycle -->

1. Each provider boundary must have a typed adapter, timeout, schema validation, machine-readable error code, and an honest execution mode. Reason: third-party APIs must be testable without mocking implementation details.
2. Live contract tests must be separate from deterministic unit tests and disabled unless an explicit `RUN_LIVE_PROVIDER_TESTS=1` gate is present. Reason: tests must not spend credits accidentally.
3. Every metered live test must enforce an invocation ledger and a one-call maximum. Reason: network retries must be idempotent and cost-bounded.
4. HTTP 200 alone is not success. The response must contain provider-specific semantic evidence and pass schema validation. Reason: transport success does not prove the integration worked.
5. Authentication failure, timeout, schema failure, and quota failure must remain distinct in the report. Reason: partial outcomes must not be rounded into success.
6. UI status must use LIVE only for a current validated provider result, NOT CONFIGURED for missing setup, and FALLBACK only after an attempted live call failed. Reason: honesty outranks visual polish.
7. Do not show uncalibrated confidence percentages. Use qualitative provenance labels such as AI observation, staff measured, and unknown. Reason: uncalibrated percentages invite over-trust.
8. Human approval must show the facts being confirmed and remain required before publish. Reason: accessibility guidance has asymmetric failure cost.
9. Loading states may reveal real agent steps but must not promise fabricated durations or progress. Reason: execution evidence is useful; fake progress damages trust.
10. Existing demo behavior and public card paths must remain backward compatible. Reason: the event demo is already verified and must not regress.

## Art direction — preserve

- Preserve the current editorial public-information aesthetic: quiet Tokyo hospitality, navy/teal/white, Japanese Mincho headings and restrained utility typography.
- Preserve the memorable element: the red blocked claim beside the green evidence-based rewrite.
- Do not introduce a generic dashboard, gradients, glass panels, emoji icons, or decorative sponsor-logo walls.
- If a connection-proof UI is proposed, it must live in the existing Agent Trace rail and show provider, purpose, mode, latency, request/job identifier, and validation result without exposing raw responses or secrets.

## Required design output

Produce an implementation-ready Markdown plan with:

1. A decision summary: what changes and what remains unchanged.
2. A provider-by-provider contract table for Qwen, GMI, ai&, Daytona, Nosana, and Qoder.
3. Exact safe connection-proof method for each provider.
4. Credential-source resolution and secret-injection flow for local and Vercel.
5. Cost and retry policy.
6. Required new files and exact existing files to change.
7. Three non-overlapping parallel GPT-5.6-sol fast work packages, including target files, forbidden scope, completion conditions, and tests.
8. Merge order and conflict boundaries.
9. Unit, contract, local E2E, production E2E, visual QA, and rollback gates.
10. A truthful evidence report schema that cannot include secret values.
11. Event-day runbook changes.
12. Three likely failure modes and fail-closed behavior.
13. A skeptical senior-review objection and response.
14. Binary acceptance criteria.

