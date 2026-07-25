# OPEN DOOR TOKYO — Opus 5 Final Live-API Redesign

Reviewed by Claude Opus 5 on 2026-07-25 after reading:

- `docs/OPUS5_LIVE_API_REDESIGN_REQUEST.md`
- `docs/HACKATHON_API_INTEGRATION_CONSTRAINTS.md`
- the current repository implementation and installed Daytona/Nosana SDK types

No partner API was called and no credential value was read during planning.

## Decision

Keep the accepted three-screen demo, human approval gate, deterministic safety
rules, private card storage, visual identity, and public card routes. Add a
fail-closed live-integration layer that can prove a current provider result
without spending past a confirmed sponsor allowance.

The implementation must:

1. distinguish `LIVE`, `VERIFIED SAMPLE`, `FALLBACK`, and
   `NOT CONFIGURED`;
2. replace raw exception strings with a closed error taxonomy;
3. reserve conservative worst-case cost durably before every billable action;
4. refuse a call when the remaining cap, price, estimate, or provider hard-limit
   state is unknown;
5. make zero automatic retries and run at most one billable action at a time;
6. validate provider-specific schema and semantic evidence before showing LIVE;
7. delete a Daytona sandbox in `finally` and stop future creation when lifecycle
   state is unknown;
8. use only read-only `jobs.get()` for Nosana proof; `jobs.list()` in the
   installed SDK is a paid bulk-create surface;
9. keep Qoder as honestly evidenced developer tooling, not a runtime provider.

## Provider contracts

| Provider | Surface | Project role | Credential name | Live proof |
| --- | --- | --- | --- | --- |
| Qwen | Alibaba Model Studio compatible-mode `chat/completions`, region/workspace-pinned | Four-frame observation extraction | `DASHSCOPE_API_KEY` | One 64-token JSON echo; schema, model and usage validated |
| GMI | `https://api.gmi-serving.com/v1/chat/completions` | Claim safety second-check | `GMI_API_KEY` | One 64-token fixed claim audit; verdict and usage validated |
| ai& | `https://api.aiand.com/v1/chat/completions` | Bilingual wording review | `AIAND_API_KEY` | One 64-token fixed review; verdict and model validated |
| Daytona | `@daytona/sdk`, `https://app.daytona.io/api` | Isolated pre-publish audit | `DAYTONA_API_KEY` | One ephemeral sandbox, bounded run, deletion in `finally` |
| Nosana | Nosana Kit 2.7.0 read API | Existing evidence-index job status | `NOSANA_API_KEY` | `jobs.get(NOSANA_JOB_ID)` only; zero paid submissions |
| Qoder | Repo Wiki and Expert Panel | Development evidence | none in runtime | Human tooling evidence only |

Exact base URL, model/job id, Qwen region/workspace, Daytona target, sponsor
balance snapshot, price source, conservative estimate, and provider hard-limit
status must be configured before a billable call.

## Durable sponsor-credit guard

The guard uses fixed-cost reservation slots:

- Production: private Vercel Blob path
  `guard/<surface>/<yyyymm>/<slot>.json`, created with
  `addRandomSuffix:false` and `allowOverwrite:false`.
- Local live test: the equivalent file is opened with atomic `wx` semantics.
- `maxSlots = floor((confirmedCap - spentSnapshot) / slotCost)`.
- The action reserves enough full slots for its conservative maximum cost
  before submission.
- Unknown reconciliation retains the reservation and blocks later calls.
- A failed partial acquisition is marked abandoned; slots are never silently
  deleted and reused.

Paid fallback and automatic top-up are compile-time false. Provider-side
credit-only mode or a hard spending limit remains an operator requirement;
the local guard is not represented as an absolute provider-side guarantee.

## Secret boundary

Credentials may be injected from macOS Keychain into a child process or typed
interactively into encrypted Vercel environment variables. They must never be
printed, copied to documentation, committed, hashed, fingerprinted, placed in
`NEXT_PUBLIC_*`, included in a model prompt, or returned by a health endpoint.
Health output is presence and guard readiness only.

## Parallel implementation packages

The frozen files are:

- `lib/providers/contract.ts`
- `lib/guard/types.ts`
- `lib/types.ts`
- `lib/status.ts`

No worker may change them. A required contract change is reported as a merge
blocker.

### WP-A — Guard, environment boundary, health

Owns `lib/guard/` except `types.ts`, `lib/env.ts`,
`app/api/health/providers/route.ts`, `scripts/with-secrets.sh`,
`.env.example`, `vitest.config.ts`, and `tests/guard.test.ts`.

Acceptance: fail-closed configuration cases; a real parallel `wx` race with
one winner; unknown reconciliation blocks the next call; health output contains
only booleans, integers, and closed enums; no network calls.

### WP-B — Provider adapters and live contracts

Owns the five provider adapters, `shared.ts`, the Nosana submit route,
provider-honesty tests, and gated `tests/live/`.

Acceptance: one outbound attempt on 429/500; closed errors only; sample is
`verified_sample`; every billable adapter reserves first; Daytona always
attempts deletion; Nosana proof never calls paid `jobs.list()`; live tests skip
unless explicitly gated.

### WP-C — Orchestration and honest UI

Owns analyze/confirm/publish routes, store/confirmation behavior, trace and
evidence UI, the existing CSS block, related unit tests, and E2E tests.

Acceptance: billable adapters run sequentially; client `useFixture` is not
trusted when real frame data is supplied; fixture facts cannot be published as
a real venue; no uncalibrated confidence percentage; trace displays provider,
purpose, mode, latency, opaque reference and validation without raw errors;
all existing demo tests remain green.

## Release gates

1. `npm run typecheck`
2. `npm test` with no network and live tests excluded
3. `npm run build`
4. `npm audit --omit=dev`
5. local Playwright suite with no provider credentials
6. gated live contract suite once, only after caps/prices/hard limits and
   credentials are securely present
7. production Playwright and visual review
8. a separate Opus 5 acceptance review

## Current credential blocker

As of the design review, local process environment, the `open-door-tokyo`
Keychain account/service names, `.env.local`, Vercel environment names, and
open browser tabs expose no configured partner credential. This is a
location-only blocker: the user must place prepared credentials in macOS
Keychain or encrypted Vercel environment variables. Raw values must not be
pasted into chat.

