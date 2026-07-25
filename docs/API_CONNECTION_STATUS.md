# Partner API Connection Status

Checked: `2026-07-25T04:25:21Z`

This report contains no credential values, hashes, prefixes, lengths, response
bodies from partner APIs, or environment dumps.

## Current production evidence

Production deployment: `dpl_3ApEy1HbnkQVfREN7DinbKJy341M` (`READY`)

`https://open-door-tokyo.vercel.app/api/health/providers` returned:

| Surface | Configured in production | Local read-only authentication | Billable/generation proof |
| --- | ---: | --- | --- |
| Qwen / Model Studio | yes | authenticated, HTTP 200 model list; `qwen3.6-flash` available | not run |
| GMI Cloud | no | authenticated, HTTP 200 model list | not run |
| ai& | no | authenticated, HTTP 200 model list | not run |
| Daytona | no | authenticated, HTTP 200 current-key lookup | not run |
| Nosana | no | authenticated, credit-balance shape validated | not run |
| Qoder Cloud Agents | developer tooling only | authenticated, HTTP 200 agent list | not run |
| Private card storage | yes | not applicable | production publish flow verified |

The approved Qwen Pay-As-You-Go read-only tuple defaults to
`https://dashscope-intl.aliyuncs.com/compatible-mode/v1`, region `intl`, and
model `qwen3.6-flash`; workspace routing is optional. One authenticated
`GET /models` request completed without generation and confirmed that the model
is available.

The current response reports Qwen with `capKnown=true`, `priceKnown=true`,
`hardLimit=unavailable`, ten one-cent reservation slots, and no outstanding
action. Qwen has a ten-cent app allocation and a one-cent maximum per request.
All other paid surfaces remain fail-closed with unknown cap or price state.
Paid fallback and auto top-up are disabled, and maximum billable concurrency
is one.

## Verification completed

- deterministic suite: 94 tests passed;
- production build and TypeScript checks: passed;
- local browser suite: 12 tests passed across desktop and mobile, with two
  mobile-only cases intentionally skipped in the desktop project;
- latest production sample flow: 2/2 passed on desktop and mobile;
- full production sample flow: capture, review, signed human approval, publish,
  and public bilingual card verified;
- browser console on the published card: no errors;
- production error-level and HTTP 500 log scans for the deployment: no matching
  log entries;
- gated billable/generation contract suite with its live flag unset: safely
  skipped all five provider tests;
- purpose-scoped Keychain loader and read-only preflight: all six sponsor
  surfaces authenticated without retry; Qwen used one read-only model-list
  request and no generation.

The billable or generation provider tests remain **NOT RUN**. The local
read-only results prove authentication and control-plane connectivity only.
They do not prove model inference, GPU execution, or sandbox execution. The
non-Qwen surfaces still lack the exact per-surface model/product allocation,
confirmed remaining app cap, official current price, conservative maximum
request cost, and provider hard limit required by the sponsor-credit guard.

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
They were not written to project files. Only the Qwen key was copied directly
from Keychain into a sensitive Vercel production environment variable; it was
not printed or persisted in a local file. The preflight
printed only provider name, normalized status, HTTP status, and non-sensitive
shape/count evidence; raw bodies and upstream error messages were suppressed.

## Safe next action

Before a billable proof for any non-Qwen surface, the operator must configure
the confirmed remaining sponsor cap allocated to this app, spent snapshot,
exact model/product, current official price, conservative maximum request cost,
and provider-side hard-limit state. Qwen uses the approved intl base URL and
`qwen3.6-flash` defaults; override them only with an explicitly approved
compatible tuple.

The gated live suite may run once only after the sponsor-credit guard reports
ready. Missing or unknown cost data is a deliberate fail-closed result, not a
connection failure.
