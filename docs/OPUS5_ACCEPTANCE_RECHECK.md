# OPEN DOOR TOKYO — Opus 5 Acceptance Recheck

Read `docs/OPUS5_ACCEPTANCE_REQUEST.md`, then recheck only the prior FAIL findings plus regression risk. Do not edit files or spend credits.

## Prior critical findings and claimed repairs

1. Qwen returned a fixture with a LIVE trace.
   - Repair: `lib/providers/qwen.ts` now parses and applies live observations and submitted frames before returning LIVE.
   - Regression test: `tests/provider-honesty.test.ts`.
2. Confirmation replaced the analyzed card with a published fixture.
   - Repair: `lib/confirmation.ts` clones and updates the analyzed card.
   - Regression test: `tests/confirmation.test.ts`.
3. Public route rendered unpublished cards.
   - Repair: `app/c/[cardId]/page.tsx` and `app/api/cards/[cardId]/route.ts` require `state === "published"` and `publishedAt`.
4. Deterministic safety block was already resolved.
   - Repair: analysis fixture and GMI adapter keep the computed block unresolved until staff confirmation.
   - Regression tests: `tests/safety.test.ts`, `tests/provider-honesty.test.ts`.
5. Daytona showed fabricated check/repair counts when not configured.
   - Repair: not-configured/fallback report zero executed checks; live code derives count from `checks.length`; UI says not executed.
   - Regression test: `tests/provider-honesty.test.ts`.
6. Publish approval was a body boolean.
   - Repair: explicit attestation creates a server-signed, 10-minute approval token; publish verifies signature, expiry, and card ID.
   - Files: `lib/approval.ts`, confirm/publish API routes, E2E.

## Additional repair

- A private Vercel Blob store is now connected for production/preview so state survives serverless instances.
- Real uploaded videos are sampled to four compressed frames in `components/capture-client.tsx`; live Qwen output uses those frames.
- The production signing secret is configured as a sensitive Vercel environment variable.

## Second-review blocker and claimed repair

The second Opus 5 review passed all six prior findings, but correctly found that a real upload still inherited the demo measurements (`8 cm`, `82 cm`, `76 cm`).

- `components/review-client.tsx` now pre-fills those values only for the `demo-cafe` sample.
- A real upload starts with blank staff-fact fields. Blank values remain unknown and are not published as measurements.
- The reviewer must explicitly record entrance step presence before confirmation is accepted.
- `app/api/confirm/route.ts` rejects an empty confirmation set and requires `entrance.step_presence`.
- `lib/safety/deterministic.ts` resolves a blocked claim only when every required field has an explicit staff confirmation.
- `lib/providers/qwen.ts` resets unmatched fixture observations to unknown before applying a live model response.
- `lib/providers/aiand.ts` accepts a LIVE result only when the returned JSON verdict is exactly `ok`.
- Frame lists require at least one frame; public hero image and QR targets are guarded.
- Regression coverage was added to the unit and browser suites.

## Third-review blocker and claimed repair

The third Opus 5 review passed the original six findings, but found one remaining real-upload path: when Qwen was not configured or its live call failed, the provider returned the full demo-cafe analysis and demo frames.

- `lib/providers/qwen.ts` now creates a fail-closed card for every non-fixture request.
- The fail-closed card keeps only submitted upload frames, clears every value and provenance entry, marks all 13 facts unknown, removes fixture verdicts, and uses a venue-neutral safety rewrite.
- The not-configured and live-error branches both return that upload-specific unknown card; neither can return demo facts.
- The Qwen request now sends OpenAI-compatible multimodal `text` and `image_url` content parts rather than embedding image URLs in a text JSON string.
- `app/api/publish/route.ts` no longer substitutes the pre-published fixture on a store miss.
- The public hero caption uses the submitted frame time instead of a hard-coded sample time.
- Regression tests cover both Qwen-not-configured and Qwen-error paths, plus a full API browser test on desktop and mobile.

## Current evidence

- `npm run typecheck`: pass
- unit tests: 47 pass
- `npm run build`: pass
- local browser tests: 6 pass
- production browser tests: 6 pass on `https://open-door-tokyo.vercel.app`
- production deployment: `dpl_48FTEWGSqVxxA233dW5nt6mnaeoi`, READY
- production storage health: configured
- `npm audit --omit=dev`: zero vulnerabilities

## Required output

- `VERDICT: PASS` or `VERDICT: FAIL`.
- Six-row prior-finding table with PASS/FAIL and exact file evidence.
- Explicit PASS/FAIL for the real-upload measurement blocker described above.
- Explicit PASS/FAIL for the Qwen not-configured/error fail-closed path.
- Any new blocker.
- Maximum three non-blocking suggestions.
- Confidence.
