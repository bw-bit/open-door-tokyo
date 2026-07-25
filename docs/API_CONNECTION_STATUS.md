# Partner API Connection Status

Checked: `2026-07-25T03:47:02Z`

This report contains no credential values, hashes, prefixes, lengths, response
bodies from partner APIs, or environment dumps.

## Current production evidence

Production deployment: `dpl_9be82ZZyhh7ySv63EQ4wAFVyiYWp` (`READY`)

`https://open-door-tokyo.vercel.app/api/health/providers` returned:

| Surface | Configured in production | Local read-only authentication | Billable/generation proof |
| --- | ---: | --- | --- |
| Qwen / Model Studio | no | blocked: region/workspace/base/model tuple missing | not run |
| GMI Cloud | no | authenticated, HTTP 200 model list | not run |
| ai& | no | authenticated, HTTP 200 model list | not run |
| Daytona | no | authenticated, HTTP 200 current-key lookup | not run |
| Nosana | no | authenticated, credit-balance shape validated | not run |
| Qoder Cloud Agents | developer tooling only | authenticated, HTTP 200 agent list | not run |
| Private card storage | yes | not applicable | production publish flow verified |

Contract correction after this recorded check: the approved Qwen Pay-As-You-Go
read-only tuple now defaults to
`https://dashscope-intl.aliyuncs.com/compatible-mode/v1`, region `intl`, and
model `qwen3.6-flash`; workspace routing is optional. The preflight can now use
authenticated `GET /models` without generation. No new external call is claimed
by this documentation update.

The same response reported every paid surface with `capKnown=false`,
`priceKnown=false`, `hardLimit=unknown`, and zero available slots. Paid
fallback and auto top-up were both disabled, and maximum billable concurrency
was one. This is the intended fail-closed state until exact non-secret budget
metadata is configured.

## Verification completed

- deterministic suite: 74 tests passed;
- production build and TypeScript checks: passed;
- production browser suite: 8/8 passed on desktop and mobile;
- full production sample flow: capture, review, signed human approval, publish,
  and public bilingual card verified;
- browser console on the published card: no errors;
- production error-level and HTTP 500 log scans for the deployment: no matching
  log entries;
- gated billable/generation contract suite with its live flag unset: safely
  skipped all five provider tests;
- purpose-scoped Keychain loader and read-only preflight: five authenticated
  surfaces succeeded sequentially with no retry; Qwen made no request.

The billable or generation provider tests remain **NOT RUN**. The local
read-only results prove authentication and control-plane connectivity only.
They do not prove model inference, GPU execution, or sandbox execution. This
run still lacks the exact per-surface model/product allocation, confirmed
remaining app cap, official current price, conservative maximum request cost,
and provider hard limit required by the sponsor-credit guard.

## Credential-location checks

The following six Keychain items were confirmed present without printing a
secret value:

- `aiand-api` / `AIAND_API_KEY`;
- `daytona-api` / `DAYTONA_API_KEY`;
- `com.gmicloud.inference` / `api-key:default`;
- `com.nosana.deploy` / `NOSANA_API_KEY`;
- `com.qoder.agent-sdk` / `QODER_PERSONAL_ACCESS_TOKEN`;
- `qwencloud-api-key` / `love.works7@gmail.com`.

The credentials were injected into one purpose-scoped child process at a time.
They were not written to project files or copied to Vercel. The preflight
printed only provider name, normalized status, HTTP status, and non-sensitive
shape/count evidence; raw bodies and upstream error messages were suppressed.

## Safe next action

Before a billable proof, the operator must configure the confirmed remaining
sponsor cap allocated to this app, spent snapshot, exact model/product, current
official price, conservative maximum request cost, and provider-side hard-limit
state. Qwen uses the approved intl base URL and `qwen3.6-flash` defaults;
override them only with an explicitly approved compatible tuple.

The gated live suite may run once only after the sponsor-credit guard reports
ready. Missing or unknown cost data is a deliberate fail-closed result, not a
connection failure.
