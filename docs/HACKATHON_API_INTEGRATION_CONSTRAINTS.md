# Hackathon API Integration — Applied Constraints

Source reviewed on 2026-07-25:

- `/Users/b/claudecode/ai-shared/skills/hackathon-api-integration/SKILL.md`
- `references/aiand-daytona.md`
- `references/qwen-gmi.md`
- `references/nosana-qoder.md`
- `references/sdk-adk-patterns.md`
- `references/credit-guard.md`

This project-local copy contains only non-secret design rules needed by the
planner. It contains no credential value and does not authorize a live call.
The user separately authorized minimal live connection tests after the
implementation is complete.

## Provider surface contract

Each provider must document:

1. provider and exact product surface;
2. project feature and expected request type;
3. SDK or API protocol and base URL;
4. target model, sandbox, job, or agent identifier;
5. required workspace, region, target, or organization;
6. credential environment-variable name, never its value;
7. cost boundary and explicit stop condition.

Do not merge product surfaces or credentials:

- ai&: OpenAI-compatible multi-model inference, including documented
  Codex/Responses compatibility where supported; base URL
  `https://api.aiand.com/v1`.
- Daytona: isolated runtime sandbox via its official SDK/API; default control
  plane `https://app.daytona.io/api`. A Daytona credential is not an LLM
  credential.
- GMI Cloud: OpenAI-compatible LLM inference at
  `https://api.gmi-serving.com/v1`. Do not claim an official Google ADK
  adapter.
- Alibaba Cloud Model Studio / Qwen: preserve the selected
  region + workspace + API key + compatible-mode base URL + model tuple.
  Use `DASHSCOPE_API_KEY` as the canonical key name.
- Nosana: official Nosana Kit / API for GPU jobs, markets, and deployment.
  API base `https://dashboard.k8s.prd.nos.ci/api`.
- Qoder: Agent SDK, Cloud Agents, and Teams administration are distinct
  surfaces. Cloud Agents base is `https://api.qoder.com/api/v1/cloud`.
  Do not treat Teams credentials as personal PATs, and do not claim a runtime
  API integration if only the coding product was used.

Prefer the current official SDK when it matches the job. OpenAI compatibility
is permitted only where the provider documents it and the endpoint supports
the required API family.

## Sponsor-credit guard

Before any potentially billable action, the exact provider surface must have
non-secret configuration for:

- native unit;
- confirmed remaining sponsor cap allocated to this app, after manual use;
- already-spent amount relative to that snapshot;
- currently reserved amount;
- conservative maximum cost of the planned action;
- official current price source;
- provider-side hard-limit status;
- `allow_paid_fallback=false`;
- `allow_auto_topup=false`;
- `max_billable_concurrency=1`.

Never infer a cap from a coupon label, old transaction, or another product
surface. Do not submit when the cap, available reservation, price ceiling,
estimated maximum cost, or completion state is unknown.

The guard must:

1. calculate a conservative maximum cost from a bounded request;
2. atomically and durably reserve that amount before submission;
3. submit only when the reservation succeeds;
4. reconcile actual non-secret usage or cost after completion;
5. retain the reservation and stop later calls if reconciliation is unknown;
6. never enable paid fallback, automatic top-up, or card-charge fallback.

An in-memory counter is not sufficient across tabs, server replicas, retries,
or workers. This app may use Vercel Blob's create-without-overwrite behavior
for durable fixed-cost reservation slots, and an atomic create-only local file
store for local live tests. A local guard alone is not an absolute
no-overage guarantee; the operator must enable a provider-side credit-only
mode or hard spending limit where available.

Bound before submission:

- ai&: selected-model price ceiling, bounded input, output-token limit;
- Daytona: resource profile, maximum runtime, storage/lifecycle ceiling;
- GMI LLM: selected-model price ceiling, bounded input/history/tool payload,
  output-token limit;
- Model Studio / Qwen: selected region/workspace model price, bounded
  input/output tokens;
- Nosana: explicit job/deployment quote, bid, and runtime;
- Qoder: documented allowance or plan quota only, never a guessed personal
  credit balance.

If reliable preflight cost bounding is unavailable, do not perform the
billable action.

## Retry, concurrency, and lifecycle

- No automatic retry on a billable call.
- Never loop on HTTP 402, insufficient funds, timeouts, or asynchronous job
  failure.
- Rate-limit handling must not increase parallelism.
- Only one concurrent billable action until every writer shares the durable
  atomic reservation mechanism.
- Billable generation is an explicit action, never an application-startup
  side effect.
- Daytona connection proof may create at most one ephemeral sandbox and must
  attempt deletion in `finally`. Unknown deletion state stops later sandbox
  creation and reports a suspected leak without raw SDK text.
- Nosana connectivity proof is authenticated and read-only. Never call
  `api.jobs.list()` for proof: in the installed SDK that surface submits a
  paid job. A paid job requires a known quote, remaining cap, explicit
  confirmation, and a durable reservation.

## Secret and evidence boundary

- Secret values may exist only in the provider dashboard, macOS Keychain,
  a child process environment, or encrypted Vercel environment variables.
- Never print, log, document, hash, fingerprint, screenshot, commit, or send
  credential values to a model.
- Reports contain closed enums, static localized descriptions, timestamps,
  non-secret model identifiers, and opaque request/job/sandbox identifiers.
  They contain no response body, request header, exception message, stack
  trace, or environment dump.
- Live tests are disabled unless an explicit gate is set. They must use the
  durable credit guard and make no automatic retry.
- HTTP 200 is not success. Provider-specific schema and semantic evidence must
  validate before a result is labeled LIVE.
- Authentication, quota, rate limit, timeout, transport, schema, semantic,
  budget, and lifecycle failures remain distinct closed error codes.

## Project-specific safety boundary

- Preserve LIVE / VERIFIED SAMPLE / FALLBACK / NOT CONFIGURED honesty.
- FALLBACK means a live attempt was made and failed. A fixture is not a
  fallback.
- Real uploads never borrow fixture facts or fixture frames.
- Human approval remains mandatory before publication.
- Qoder is developer tooling unless an actual documented runtime surface is
  implemented. It must not be added to the runtime provider trace merely for
  sponsor count.
