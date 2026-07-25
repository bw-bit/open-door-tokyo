# OPEN DOOR TOKYO — 8-slide deck content

Deck rule: show the product as it is verified today. Do not label authentication
checks as generation, and do not imply that a paid model, GPU job, or sandbox
was executed.

## Slide 1 — The problem: “Accessible” is not enough

### On-slide copy

**Before visiting, people need facts—not a certification.**

- Tokyo’s small venues often know about steps, doorway width, seating, and
  communication support.
- Turning those details into a maintained Japanese/English page takes time the
  venue may not have.
- A broad claim such as “wheelchair accessible” can hide the exact information
  a visitor needs to make their own decision.

**OPEN DOOR TOKYO turns a short venue walkthrough into evidence-linked,
bilingual pre-visit information.**

### Suggested production screenshot

- `/capture` hero and video-input area:
  `https://open-door-tokyo.vercel.app/capture`
- Existing approved capture:
  `docs/qa/capture-production-final.png`

### Speaker note

Open with the information gap, not with AI. The product does not decide whether
a venue is suitable for every person. It helps a venue publish concrete facts
so each visitor can decide for themselves.

## Slide 2 — Solution and demo flow

### On-slide copy

**20-second walkthrough → reviewed Access Card → human-approved publication**

1. Capture the route from entrance to seat.
2. Structure observations, evidence frames, and unknowns.
3. Block unsupported claims.
4. Ask staff to measure or confirm what video cannot prove.
5. Let staff manually correct the bilingual AI description or return it to
   `unknown`.
6. Review Japanese/English wording and pre-publication checks.
7. Publish only after explicit human confirmation.
8. Open the bilingual card from a QR code, copy Google listing text, or embed
   it in a venue site.

Execution is always labeled as one of:
`LIVE` / `VERIFIED SAMPLE` / `FALLBACK` / `NOT CONFIGURED`.

### Suggested production screenshots

- Left: capture page, `docs/qa/capture-production-final.png`
- Center: evidence review, `docs/qa/review-production-final.png`
- Right: mobile public card, `docs/qa/card-production-mobile-final.png`

### Speaker note

Demo the verified sample path. Say “verified sample” out loud; do not call it a
live model run. The production sample flow—from capture through signed approval,
publication, and the public mobile card—has been browser-tested.

## Slide 3 — Evidence safety: unknown is a valid result

### On-slide copy

**We do not certify. We clarify.**

- Every AI observation links back to a frame and timestamp; manual corrections
  keep that provenance and add a staff source.
- Measurements are staff facts, not values inferred from pixels.
- Missing evidence remains visibly `unknown`.
- Deterministic rules block unsupported universal claims before any optional
  model review.
- “Wheelchair accessible” is replaced with concrete statements such as a step,
  a measured width, or the need to ask staff for a ramp.
- Publication requires required facts, staff attestation, and a server-signed
  approval valid for ten minutes.

Provider failures use closed error codes. Raw provider responses, exception
messages, and secrets are not exposed in cards or traces.

### Suggested production screenshot

- Evidence Review with the red Safety Audit, unknown items, evidence frame, and
  `STAFF FACTS`: `docs/qa/review-production-final.png`
- Crop tightly enough that the blocked claim and concrete rewrite are readable.

### Speaker note

This is the product’s central differentiator. Show what the system refuses to
say. If an actual upload cannot be analyzed, it keeps only that upload’s frames
and marks facts unknown; it never borrows facts from the demo fixture.

## Slide 4 — Why Tokyo, and why Japan now

### On-slide copy

**Designed for the last 20 meters of a Tokyo visit**

- MVP focus: small Tokyo cafés and restaurants.
- Captures venue-specific details that generic listings often miss: entrance
  steps, path to the seat, communication options, and unresolved restroom facts.
- Japanese/English output supports both local visitors and international guests.
- A quiet, mobile-first public card and QR flow fit the venue entrance and
  pre-visit planning.
- The workflow keeps the venue staff responsible for measurements and final
  publication.

Next operational layer: venue consent, periodic reconfirmation, update history,
and a contact path for corrections.

### Suggested production screenshot

- Mobile public card:
  `https://open-door-tokyo.vercel.app/c/demo-cafe`
- Existing approved mobile capture:
  `docs/qa/card-production-mobile-final.png`

### Speaker note

Avoid claiming city-wide coverage or production readiness for every venue type.
This is a focused hackathon MVP for Tokyo’s small venues, with a clear path to
ongoing verification rather than a one-time accessibility badge.

## Slide 5 — Sponsor integrations: code-level roles, honest execution evidence

### On-slide copy

| Integration | Distinct code-level role | Verified current evidence |
| --- | --- | --- |
| Qwen / Model Studio | Up to four frames → bounded structured observations and unknowns; official intl `qwen3.6-flash` defaults, schema, model, usage, and evidence mapping validated | Production configured; read-only `/models` authenticated and model available; first billable inference remains unused |
| GMI Cloud | Independent claim-safety verdict with bilingual concrete rewrites | Authenticated read-only model-list check, HTTP 200 |
| ai& | Japanese/English wording safety review without adding facts | Authenticated read-only model-list check, HTTP 200 |
| Daytona | One ephemeral pre-publish sandbox; 10-minute TTL, 30-second run, deletion in `finally` | Authenticated read-only current-key check, HTTP 200 |
| Nosana | Existing job status via `jobs.get()`; paid submission isolated behind quote, confirmation, idempotency, and reservation | Authenticated read-only credit-shape check; no job submitted |
| Qoder | Expert Panel / Repo Wiki development workflow | Authenticated read-only agent-list check, HTTP 200; developer tooling, not a runtime trace |

The recorded preflight authenticated all six sponsor surfaces. Qwen completed
one read-only `/models` request and confirmed that `qwen3.6-flash` is available;
no generation was performed.

**Billable Qwen inference, GPU execution, sandbox execution, and all five gated
live provider contract tests remain NOT RUN.**

### Suggested production screenshot

- Production provider health response:
  `https://open-door-tokyo.vercel.app/api/health/providers`
- Pair with a small code screenshot from `lib/providers/` showing the five
  adapters; do not show environment values or terminal secret-loading output.

### Speaker note

Be exact: authentication proves credentials and control-plane connectivity, not
generation. The earlier Qwen preflight made zero requests; the adapter now uses
the approved intl base/model defaults and keeps inference guard-gated. Qoder supported
development; it is not presented as a sixth runtime provider.

## Slide 6 — Architecture: sequential, bounded, fail-closed

### On-slide copy

```text
Video + representative frames
        ↓
Qwen structured observations (optional live / verified sample)
        ↓
Deterministic safety rules → optional GMI second check
        ↓
Evidence Review → staff measurements and attestation
        ↓
Optional ai& wording review → optional Daytona isolated audit
        ↓
10-minute signed approval → explicit publish action
        ↓
Private card JSON storage → public bilingual Access Card + QR
        ↓
Optional signed, idempotent consumer-map listing webhook

Nosana read-only existing-job proof is separate.
Paid Nosana submission is an isolated admin-only path.
```

For every billable surface:

- durable maximum-cost reservation before the call;
- one billable action at a time;
- zero automatic retries, paid fallback, or auto top-up;
- unknown cap, price, estimate, hard limit, or reconciliation → no call;
- `LIVE` only after schema and provider-specific semantic evidence passes and
  changes the result.

### Suggested production screenshot

- Review page Agent Trace:
  `https://open-door-tokyo.vercel.app/review/demo-cafe`
- Existing approved review capture:
  `docs/qa/review-production-final.png`
- Add simple arrows in the presentation tool; do not fabricate provider result
  screenshots.

### Speaker note

The orchestration is intentionally sequential. The safety rule runs even when
GMI is unavailable. Nosana’s installed SDK names paid bulk creation
`jobs.list()`, so read-only proof uses only `jobs.get()` and the paid path is
separately named and guarded.

## Slide 7 — Validation and current traction

### On-slide copy

**Verified on 25 July 2026**

- Production deployment: `READY`
- TypeScript and production build: passed
- Deterministic/unit suite: **94 tests passed**
- Local browser suite: **12 tests passed** across desktop and mobile
- Latest production sample flow: **2/2 passed**, desktop and mobile
- Full production sample flow verified:
  capture → review → signed human approval → publish → public bilingual card
- Published-card browser console: no errors
- Production error-level and HTTP 500 log scans: no matching entries
- Production dependencies: zero reported vulnerabilities
- Gated provider tests safely skipped with the live flag unset

Current limitation:
Qwen is configured and guard-ready in production, but no billable inference has
been consumed. The other paid surfaces remain fail-closed until their cap,
price, maximum cost, and hard-limit metadata are configured.

### Suggested production screenshots

- Three-image validation strip:
  `docs/qa/capture-production-final.png`,
  `docs/qa/review-production-final.png`,
  `docs/qa/card-production-mobile-final.png`
- Small text link: `https://open-door-tokyo.vercel.app`

### Speaker note

Call this product validation, not user traction. There is no verified venue
adoption or visitor usage metric yet. The strongest evidence today is a
deployed, browser-tested end-to-end sample workflow and a deliberately closed
paid-provider boundary.

## Slide 8 — Ask and closing

### On-slide copy

**From verified demo to a small Tokyo venue pilot**

We are looking for:

1. **Pilot venues** willing to capture and maintain concrete entrance-to-seat
   facts.
2. **Accessibility reviewers and users** to challenge the questions, wording,
   and correction flow.
3. **Sponsor support** to configure exact product allocations, official current
   prices, app-specific remaining caps, and provider-side hard limits before
   one gated contract run.

Success for the pilot:
venues can publish and update evidence-linked bilingual facts without turning
them into a universal certification.

**OPEN DOOR TOKYO**  
*We do not certify. We clarify.*

`https://open-door-tokyo.vercel.app`

### Suggested production screenshot

- Full-height mobile Access Card and QR:
  `docs/qa/card-production-mobile-final.png`
- Keep the disclaimer visible: the card is information, not certification or a
  suitability decision.

### Speaker note

Close on the user outcome. The immediate technical ask is not “more credits” in
the abstract; it is the exact non-secret pricing and hard-limit configuration
needed to perform one guarded proof without risking sponsor overage.
