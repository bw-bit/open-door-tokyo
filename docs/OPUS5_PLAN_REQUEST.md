# OPEN DOOR TOKYO — Opus 5 Planning Request

## Role

You are the senior product/technical planner for a one-day AI hackathon. Produce an implementation-ready plan only. Do not edit source code, create accounts, spend partner credits, deploy, or send external messages.

## Source brief

Read this complete proposal first:

`/Users/b/.codex/attachments/04b865a7-1100-404f-95e4-caa1fcf5029c/pasted-text.txt`

The project is **OPEN DOOR TOKYO**:

> 90 seconds of guided venue filming becomes an evidence-backed Access Card that lets visitors make their own visit decision.

The central safety principle is:

> We do not certify. We clarify.

The agent must not label a venue as universally accessible, barrier-free, safe, suitable, or compliant. It should expose specific observed and staff-confirmed facts, unknowns, conflicts, evidence, dates, and provenance.

## Hackathon constraints

- Theme: solve a real problem through Tokyo/Japan creativity, culture, tourism, retail, makers, or Japanese business workflows.
- Build window on event day: 11:30–16:00 (4.5 hours).
- Demo: 3 minutes.
- It must access the real internet, be deployed on the web, and run live by demo time.
- Scoring:
  1. Tokyo/Japan relevance
  2. Innovation
  3. Real-world problem solved
  4. Number and depth of code-level partner integrations
- Team size is unknown. Plan for one primary builder using AI coding tools, but identify clean parallel work packages if teammates join.
- Pre-event work may build a full scaffold, demo fixtures, UI, tests, provider adapters, docs, and deployment configuration.
- Event-day partner credentials/credits may be required before live calls can be verified.

## Partner stack and intended roles

- Qwen Cloud: multimodal representative-frame analysis and structured JSON extraction.
- GMI Cloud: a different model audits unsupported conclusions and rewrites them as concrete facts.
- ai&: safe, concrete Japanese phrasing and staff follow-up questions.
- Nosana: one asynchronous speech-to-text/GPU container job. It must be optional and must fail over to a pre-generated transcript.
- Daytona: isolated processing/build/test workflow, accessibility audit, repair loop, and preview evidence.
- Qoder: Experts Mode and Repo Wiki as development evidence.

Known event credits:

- Daytona: USD 100.
- GMI Cloud: USD 10.
- Other event credit amounts may be provided on the day.

## Current state

- No application code exists yet.
- A screen-1 visual concept was generated with ChatGPT Images 2.0 at:
  `/Users/b/.codex/generated_images/019f94f8-60ce-77c0-8d12-374a7e30a509/call_5VOXcg7P0wRAEyFJm0XkddDD.png`
- The implementation will live under:
  `/Users/b/Documents/codex 2/open-door-tokyo`
- The application should have three core screens:
  1. guided capture/video upload
  2. evidence review with staff confirmation
  3. public bilingual Access Card with evidence drawer and QR link

## Required product behavior

1. Guided capture tells staff what to film.
2. Video upload accepts a short MP4/MOV.
3. Preprocessing extracts 6–8 representative frames and an audio track.
4. Model output uses a strict schema and never fills missing facts.
5. Evidence review separates:
   - observed/confirmed
   - staff input required
   - unknown/unverifiable
   - conflicts
6. Staff can enter measurements and confirmations.
7. A second-model safety audit blocks broad claims such as:
   - wheelchair accessible
   - fully barrier-free
   - safe for everyone
   - compliant/certified
8. Access Card gives concrete facts in Japanese and English.
9. Each fact opens its evidence or staff source.
10. Unknowns and conflicts remain visible.
11. The public card shows its last verification date.
12. External contact or publication requires a human-confirmed action.
13. The demo has a deterministic fixture/fallback, but the UI must honestly distinguish LIVE, FALLBACK, and NOT CONFIGURED.
14. Provider keys must remain server-side and never be logged or sent to the browser.

## Planning output required

Write in Japanese. Be decisive and optimize for winning and finishing, not for feature breadth.

Include all of the following:

1. A one-sentence mechanical definition of DONE.
2. A short verdict on whether this concept should remain the main entry.
3. The winning demo story and the single most memorable proof point.
4. Scope:
   - P0 must ship
   - P1 only if P0 is green
   - explicit cuts
5. Architecture:
   - frontend
   - server/API
   - storage/state
   - media preprocessing
   - provider adapters
   - public Access Card
   - deployment
6. Exact state machine from upload to publication.
7. Canonical TypeScript data model for:
   - venue brief
   - evidence item
   - status enum
   - provenance
   - safety audit
   - provider trace
   - Access Card
8. Provider-by-provider contract:
   - exact input
   - exact output
   - timeout
   - retry policy
   - fallback
   - evidence shown to judges
9. Repository/file tree with responsibilities.
10. Pre-event implementation sequence with dependencies.
11. Event-day runbook from 10:00 through 16:00, including credential setup, one smoke test per provider, freeze time, submission, and backup.
12. Three-minute demo timing and clicks.
13. Automated acceptance tests and manual visual/accessibility checks.
14. Failure-mode table with owner action.
15. Security/privacy/safety gates.
16. Sponsor integration evidence checklist.
17. Submission assets checklist.
18. A binary go/no-go gate at 14:00 and 15:15.
19. The first five concrete implementation tasks to hand to an engineering agent.
20. A skeptical senior reviewer objection and an evidence-based response.
21. Confidence marked high/medium/low for the plan areas that are genuinely uncertain.

## Non-negotiable planning rules

- Do not plan a universal accessibility score or certification.
- Do not claim automated accessibility testing proves WCAG conformance.
- Do not require Nosana for the critical path.
- Do not place provider credentials in client code.
- Do not invent current API methods or model IDs; where event-day docs determine them, define an environment-configured boundary and a smoke test.
- Do not assume external publication or messaging is authorized before a human action.
- Distinguish a code adapter existing from a verified live provider call.
- Optimize for a stable 3-minute demo over broad feature coverage.
- Clearly label anything that cannot be completed before event-day credentials arrive.
