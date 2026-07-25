# OPEN DOOR TOKYO — Opus 5 Independent Acceptance Review

You are the independent evaluator. Do not edit any file and do not deploy or spend credits.

## Product goal

Build a live, web-deployed AI agent for Agent Forge Tokyo that converts a short guided venue video into a bilingual, evidence-backed pre-visit Access Card. It must never certify universal accessibility. Unknowns remain visible and a human must explicitly approve publication.

## Inspect

- `README.md`
- `docs/OPUS5_IMPLEMENTATION_PLAN.md`
- `docs/DEMO_SCRIPT.md`
- `docs/RUNBOOK.md`
- `docs/SPONSOR_INTEGRATIONS.md`
- `app/`
- `components/`
- `lib/`
- `fixtures/`
- `tests/`
- `.env.example`
- `package.json`

Production URL: `https://open-door-tokyo.vercel.app`

## Evidence already claimed by the implementer

- `npm run verify`: exit 0
- unit tests: 37 pass
- local browser tests: 4 pass
- production browser tests: 4 pass
- `npm audit --omit=dev`: 0 vulnerabilities
- Vercel production state: READY

Do not trust these claims. Re-run safe read-only checks if useful.

## Binary gates

1. Theme: clearly rooted in a Tokyo/Japan real-world workflow.
2. Agent behavior: capture → extract → detect gaps → safety audit → staff confirmation → sandbox audit → human publish.
3. Safety: no certification/universal usability; deterministic rules; unresolved required fact or missing human approval blocks publish.
4. Evidence: public facts have provenance; unknown facts remain visible.
5. Partner stack: Qwen, GMI, ai&, Nosana, Daytona are code-level integrations with distinct roles; Qoder preparation exists.
6. Honesty: live/fallback/not-configured are not conflated.
7. Security: keys stay server-side; GPU job cannot be posted accidentally; private storage supported.
8. Demo: one coherent flow can be shown in under three minutes and the public card works on mobile.
9. Engineering: typecheck, tests, build, and deployable architecture are credible.
10. Presentation: the main safety-blocking moment is obvious and memorable.

## Output

Return:

- `VERDICT: PASS` only if no required blocker remains, otherwise `VERDICT: FAIL`.
- A 10-row gate table with PASS/FAIL and concrete evidence paths.
- Critical issues, if any.
- Non-blocking improvements, maximum five.
- One skeptical senior objection and a concrete response.
- Confidence: high/medium/low.

