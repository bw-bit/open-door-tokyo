# Partner API Connection Status

Checked: `2026-07-25T05:39:49Z`

This report contains no credential values, hashes, prefixes, lengths, response
bodies from partner APIs, or environment dumps.

## Current production evidence

Production deployment: `dpl_3ApEy1HbnkQVfREN7DinbKJy341M` (`READY`)

`https://open-door-tokyo.vercel.app/api/health/providers` returned:

| Surface | Configured in production | Local read-only authentication | Billable/generation proof |
| --- | ---: | --- | --- |
| Qwen / Model Studio | yes | authenticated, HTTP 200 model list; `qwen3.6-flash` available | one guarded real-video inference passed schema + semantic validation |
| GMI Cloud | no | authenticated model list; Kimi K3 available | two inference attempts failed; no review result; conservatively USD 0.10 spent |
| ai& | no | authenticated, HTTP 200 model list | one guarded `deepseek-v4-flash` 64-token contract passed locally |
| Daytona | no | authenticated current-key lookup; shared targets `eu` / `us` | one guarded ephemeral sandbox contract passed locally; 8 checks; live-mode deletion verified |
| Nosana | no | authenticated, credit-balance shape validated | not run |
| Qoder Cloud Agents | developer tooling only | authenticated, HTTP 200 agent list | not run |
| Private card storage | yes | not applicable | production publish flow verified |

The approved Qwen Pay-As-You-Go read-only tuple defaults to
`https://dashscope-intl.aliyuncs.com/compatible-mode/v1`, region `intl`, and
model `qwen3.6-flash`; workspace routing is optional. One authenticated
`GET /models` request completed without generation and confirmed that the model
is available.

After the one guarded proof, the current response reports Qwen with
`capKnown=true`, `priceKnown=true`, `hardLimit=unavailable`, nine remaining
one-cent reservation slots, and no outstanding action. Qwen has a ten-cent app
allocation and a one-cent maximum per request.
All non-Qwen paid surfaces remain unconfigured in production. The successful
ai& and Daytona proofs used local, purpose-scoped guard configuration and were
not deployed.
Paid fallback and auto top-up are disabled, and maximum billable concurrency
is one.

## Current local sponsor evidence

- **Qwen:** one guarded real-video inference reached `LIVE` with
  `qwen3.6-flash`; schema and semantic validation passed.
- **ai&:** one guarded 64-token live contract passed with
  `deepseek-v4-flash`.
- **Daytona:** one guarded ephemeral sandbox contract passed with a USD 0.05
  maximum reservation. The audit ran 8 checks, returned live mode, and the
  sandbox deletion path was verified.
- **GMI Cloud:** authenticated model discovery confirmed Kimi K3. Two inference
  attempts failed and produced no usable safety-review result. To avoid
  understating sponsor use, USD 0.10 is recorded conservatively as spent.
- **Nosana:** authenticated credit/read-only evidence only. No paid GPU job was
  submitted.
- **Qoder:** authenticated Cloud Agents list only. This remains developer
  tooling, not a runtime provider execution.

These are local results unless explicitly identified as the existing Qwen
production proof. Production configuration remains unchanged: only Qwen is
configured, and this documentation update did not deploy the app.

## Verification completed

- deterministic suite: 94 tests passed;
- production build and TypeScript checks: passed;
- local browser suite: 12 tests passed across desktop and mobile, with two
  mobile-only cases intentionally skipped in the desktop project;
- latest production sample flow: 2/2 passed on desktop and mobile;
- one real iPhone-video Qwen proof: `LIVE`, `qwen3.6-flash`,
  `SCHEMA + SEMANTIC PASS`, 5,161ms, no retry; one concrete door observation
  accepted and ten fields retained as unknown;
- full production sample flow: capture, review, signed human approval, publish,
  and public bilingual card verified;
- browser console on the published card: no errors;
- production error-level and HTTP 500 log scans for the deployment: no matching
  log entries;
- individual guarded local contracts completed for ai& and Daytona; the Qwen
  real-video proof remains the only production-configured model inference;
- purpose-scoped Keychain loader and read-only preflight: all six sponsor
  surfaces authenticated without retry; Qwen used one read-only model-list
  request and no generation.

The full multi-provider suite was not run as one batch. Instead, ai& and
Daytona were exercised once through isolated guarded local contracts. The app
also completed exactly one guarded Qwen inference through the production upload
flow. GMI made two unsuccessful inference attempts and yielded no review;
Nosana performed no GPU execution; Qoder performed no runtime execution.

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

Before any further billable proof for a non-Qwen surface, the operator must configure
the confirmed remaining sponsor cap allocated to this app, spent snapshot,
exact model/product, current official price, conservative maximum request cost,
and provider-side hard-limit state. Qwen uses the approved intl base URL and
`qwen3.6-flash` defaults; override them only with an explicitly approved
compatible tuple.

Do not repeat the Qwen proof merely for demonstration; use the saved LIVE
review and recording. Do not retry GMI without a newly approved test plan and
budget; its two failed attempts are already recorded as USD 0.10 spent. Nosana
remains read-only. Any remaining live contract may run only after that
surface's sponsor-credit guard reports ready. Missing or unknown cost data is a
deliberate fail-closed result, not a connection failure.
