# OPEN DOOR TOKYO — Final Submission

## Project name

**OPEN DOOR TOKYO**

## Tagline

**We do not certify. We clarify.**

短い店舗動画を、根拠付きの日英 Access Card へ。

## Project description — English

OPEN DOOR TOKYO turns a short walkthrough video from a small Tokyo venue into a bilingual, evidence-linked Access Card. The agent separates AI-observed facts, staff-confirmed measurements, and unknowns; blocks unsupported claims such as “wheelchair accessible”; and publishes only after explicit human confirmation. Visitors receive concrete information about entrances, steps, routes, seating, and communication options so they can make their own informed visit decisions.

## プロジェクト説明 — 日本語

OPEN DOOR TOKYOは、東京の小規模店舗が撮影した短い店内案内動画を、根拠付きの日英 Access Cardへ変換するAIエージェントです。映像から観察できた事実、スタッフが実測・確認した事実、未確認事項を分け、「車椅子で利用可能」のような根拠不足の断定を停止します。人が明示的に確認した後だけ公開し、入口、段差、通路、席、コミュニケーション方法など、来店者が自分で判断するための具体的情報を提供します。

## Public demo

https://open-door-tokyo.vercel.app

## Submission details

- Team member name: **yuta**
- Team member email: **love.works7@gmail.com**
- GitHub repository: **https://github.com/bw-bit/open-door-tokyo**

## Judging criteria mapping

### 1. Tokyo / Japan relevance

- Designed for Tokyo’s small venues, where useful accessibility details often exist but are not organized or published bilingually.
- Produces Japanese and English information for residents, domestic visitors, and international travelers.
- Fits real Japanese retail and hospitality workflows: a staff member records a short walkthrough, confirms facts, and shares a QR-linked card.

### 2. Innovation

- Treats uncertainty as a product output instead of hiding it: observed facts, staff-confirmed facts, conflicts, and unknowns remain visibly distinct.
- The memorable safety mechanism is an agent that knows when not to make a claim. Deterministic rules stop unsupported universal statements and replace them with concrete, evidenced wording.
- Every published fact links back to a frame or staff source; the system clarifies without claiming certification or compliance.

### 3. Real-world problem solved

- Small venues often lack the time and specialist knowledge to research, translate, and maintain detailed access information.
- Visitors need concrete pre-visit facts—not a vague “accessible” label—to judge whether a venue works for their individual needs.
- The workflow turns a short capture into a reviewable, bilingual, mobile-friendly card while preserving human approval before publication.

### 4. Number and depth of partner integrations

- **Qwen Cloud:** bounded multimodal representative-frame analysis and structured observation extraction.
- **GMI Cloud:** independent review of unsupported accessibility conclusions.
- **ai&:** bilingual wording review that preserves confirmed facts.
- **Daytona:** isolated pre-publication audit in an ephemeral sandbox.
- **Nosana:** read-only verification of an existing evidence-index job; paid submission is isolated behind explicit budget and approval controls.
- **Qoder:** development evidence through task decomposition, Expert Panel review, and Repo Wiki; it is not misrepresented as a runtime provider.
- Runtime traces distinguish `LIVE`, `VERIFIED SAMPLE`, `FALLBACK`, and `NOT CONFIGURED`. Sponsor-credit reservations fail closed when cap, price, estimate, or hard-limit state is unknown.

## Required material checklist

### Submission form

- ☑ Project name and tagline
- ☑ Concise English description
- ☑ Concise Japanese description
- ☑ Public web demo URL
- ☑ Team member name entered
- ☑ Team member email entered
- ☑ Public GitHub repository URL entered
- ☑ Tokyo/Japan relevance explained
- ☑ Innovation and real-world impact explained
- ☑ Partner integrations mapped to code-level roles

### Demo and evidence

- ☑ Demo recording completed and technically reviewed (30.36 seconds)
- ☐ Desktop and mobile screenshots selected
- ☐ Capture → evidence review → staff confirmation → public card flow rehearsed
- ☐ Safety-audit moment showing a blocked unsupported claim included
- ☐ QR-linked bilingual public card shown
- ☐ Provider trace modes shown honestly
- ☐ Sponsor integration code paths and evidence prepared for judges

### Release and repository hygiene

- ☐ Public repository created and repository URL inserted above
- ☐ `.env.local`, credentials, private keys, tokens, and local deployment metadata excluded from the public repository
- ☐ README setup and no-credential demo instructions verified
- ☐ License and required attribution files verified
- ☐ Production URL opened in an unauthenticated browser
- ☐ Final test, build, browser-flow, and secret-hygiene checks recorded

## Three-minute demo arc

1. Upload or select the short venue walkthrough.
2. Show evidence-linked observations and facts that remain unknown.
3. Show the safety audit blocking an unsupported “wheelchair accessible” claim.
4. Confirm staff-measured facts and issue the short-lived publication approval.
5. Publish and open the bilingual Access Card from its QR code.
6. Close with: **“We do not certify. We clarify.”**

## Safety and honesty statement

OPEN DOOR TOKYO does not certify that a venue is universally accessible, barrier-free, safe, legally compliant, or WCAG-conformant. Measurements are published only as staff-confirmed facts. Unknowns remain visible. External-provider failures are not displayed as successful live execution, and publication requires an explicit human-confirmed action.
