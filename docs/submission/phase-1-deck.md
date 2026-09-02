# Dhan Sarthi — Final PPT Content
*This is the Phase 1 submission text as submitted. Future Self / photo age-progression were later cut in favour of the Autopilot spine — see [docs/product/autopilot.md](../product/autopilot.md).*

*Paste-ready text for the official Hack2skill 14-slide template. Screenshots referenced were captured from the earlier prototype. Keep bullets on slides short — anything in [brackets] is an instruction, not slide text.*

---

## Slide 1 — Team Details

**Team Atomic**
IDBI Innovate 2026 · Problem Statement 1: Digital Wealth Management

- **Krishna Faujdar** — AI & Backend
- **Rajveer Bishnoi** — Product & Design
- **Mohit Kumar** — Full-stack & Architecture


---

## Slide 2 — Idea Overview

# Dhan Sarthi
### Advice from the one advisor every customer trusts: **their own future self.**

- An AI wealth advisor inside **IDBI GO Mobile+**, embodied as the customer's **age-progressed future self** — you don't read advice, you *talk to the person your money decisions create*.
- **Live voice conversations** (real-time speech-to-speech AI): the avatar listens, speaks, remembers — and **operates the app while talking**. Say *"what if I invest ₹20,000 a month?"* — the SIP planner moves itself and your future visibly changes on screen.
- Advice is driven by **actual spending behaviour** (bank transactions + RBI Account Aggregator, with consent), not questionnaires — and every recommendation is **SEBI-suitability-checked, explained, and audit-logged**.

> *"A private banker for every IDBI account — built on the science that meeting your future self doubles how much you save."*

---

## Slide 3 — Opportunities

**The market is enormous and under-advised:**
- India wealth-management AUM: **US$1.1T (FY24) → ~US$2.3T by FY29** (Deloitte)
- Only **~3–5% of Indians** hold mutual funds; the "missing middle" (₹2.5–13L income) is at ~5–6% penetration — human RMs can't economically reach them
- SIP inflows at all-time highs (**₹31–32k Cr/month, 2026**) — the intent exists; personalized guidance doesn't
- Rails are ready: **25+ Cr Account Aggregator users, 2.6 Bn linked accounts** (Sahamati, Dec 2025)

**Why IDBI, why now:**
- Retail is **~61% of IDBI's book**; post-privatization, **fee income** (MF distribution + bancassurance) is the growth lever — digital wealth is its highest-leverage engine
- **IDBI GO Mobile+ has no advisory, goal-planning, or wealth view today** — genuine white space vs. every peer bank
- **LIC partnership**: IDBI is LIC's #1 bancassurance channel — insurance & annuities plug natively into goal-based advice

---

## Slide 4 — Unique Value Proposition

**No bank in India has combined an avatar with regulated wealth advisory:**

| | Avatar | Wealth advice | Behaviour-driven | Live voice |
|---|---|---|---|---|
| BoB "Aditi" (2024) | ✅ | ❌ service bot | ❌ | partial |
| HDFC SmartWealth (2024) | ❌ | ✅ DIY | ❌ | ❌ |
| SBI Financial Fitness (2026) | ❌ | ⚠️ score, not advice | ⚠️ | ❌ |
| **Dhan Sarthi (IDBI)** | ✅ **your future self** | ✅ regulated, goal-based | ✅ | ✅ **built & live** |

**The avatar is science, not decoration:**
- Hershfield et al. (*Journal of Marketing Research*, 2011): people shown age-progressed renderings of themselves allocated **~2× more to retirement savings**; the reactive-face-on-a-slider design lifted real contribution rates
- MIT Media Lab "Future You" (2024, RCT n=344): talking to an AI future self **reduced anxiety and increased motivation & future self-continuity**
- Banking precedent: NatWest's avatar assistant pilot delivered **+150% customer satisfaction**

**The moat:** a chatbot can be copied in a quarter. IDBI's transaction depth + LIC product shelf + compliance-native architecture cannot.

---

## Slide 5 — Feature List

**🗣️ Live voice advisor (built & working)**
- Real-time speech-to-speech conversation with your future self — interruptions, live captions, typed fallback
- **The avatar drives the app**: voice commands move the SIP planner, navigate screens, book RM callbacks
- Speaks with memory & personality ("I remember being 29… salary gone by the 20th")

**📊 Behaviour engine**
- Spend categorization & idle-surplus detection from consented transactions ("₹18,400 sat idle this month")
- Proactive nudges at trigger moments: salary day, FD maturity, missing insurance

**✨ Future Self planner**
- Age-progressed avatar whose world visibly improves as your SIP rises; life-event "memories unlock" at milestones
- Twin live numbers: *pinch today* vs. *monthly income at 60, for life* · everyday prices in 2057 · goal coverage meter
- One-tap SIP with e-sign; protection-first flags (term insurance via LIC)

**🛡️ Compliance layer (a feature, not an afterthought)**
- SEBI risk profiling & suitability gate on every recommendation; "Why this advice?" explanation stored for audit
- AI-usage disclosure (SEBI 2025), DPDP-compliant granular consent, human-RM escalation — never a dead end

---

## Slide 6 — Process Flow

[Swimlane diagram: Customer → Avatar UX → Behaviour Engine → Advisory Engine → Compliance Gate → Human RM]

1. **Consent** — DPDP notice; link external accounts via Account Aggregator
2. **Ingest** — core-banking transactions + AA feeds stream into the behaviour engine
3. **Understand** — categorize spend, detect surplus, infer goals & life events
4. **Profile** — conversational risk profiling; SEBI risk profile recorded with consent
5. **Advise** — goal engine + product-shelf RAG draft a recommendation → **hard suitability gate** → explanation generated
6. **Deliver** — future-self avatar presents it (voice or text, vernacular) at the right moment
7. **Act** — one-tap SIP / FD split / insurance with e-sign; nothing executes without explicit confirmation
8. **Govern** — every input, recommendation & explanation logged (5-yr retention); low-confidence or distressed cases auto-escalate to a human RM

---

## Slide 7 — Wireframes / Mockups

[Use real prototype screens — stronger than wireframes. Layout suggestion: 2×2 grid]

- `01-onboarding-intro.png` — the future self introduces itself ("It's me — you, at sixty")
- `05-dashboard.png` — idle-surplus hero, spend analysis, proactive nudges
- `06-future-self-low.png` + `07-future-self-high.png` **side by side** — caption: *"Same customer, same age 60 — the only difference is ₹22,000/month. This is what makes people act."*
- `11-voice-call-greeting.png` — live voice call in progress

---

## Slide 8 — Architecture

[Layered diagram]

- **Channel layer** — Dhan Sarthi SDK embedded in IDBI GO Mobile+ (React Native module); WhatsApp/kiosk later
- **Experience layer** — avatar service (age-progression rendering + multilingual TTS/STT), conversation orchestrator
- **Intelligence layer**
  - Behaviour engine: streaming spend categorization, surplus & life-event detection
  - Goal & projection engine: deterministic math + Monte-Carlo simulations
  - Advisory LLM with guardrails, RAG-grounded on the IDBI/LIC product shelf — **"LLM drafts, rules decide"**: every output passes a deterministic suitability gate
- **Compliance layer (cross-cutting)** — consent manager (DPDP/AA), suitability service, explanation store, model registry & audit vault (per SEBI's AI/ML framework)
- **Data layer** — core banking, AA FIU module (Sahamati), CRM, product shelf
- **Infra** — containerized on the bank's cloud; all PII in-country; RM handoff into existing CRM queues

---

## Slide 9 — Technology Stack

- **App**: React (PoC, deployed) → React Native SDK for GO Mobile+ integration
- **Voice (working in PoC)**: OpenAI gpt-realtime speech-to-speech over WebRTC with function-calling — the voice agent operates the app UI; production swaps to bank-hosted, in-region realtime models
- **Backend**: serverless token service (deployed on Vercel in PoC) → Node.js/Python microservices, Kafka, PostgreSQL in production
- **AI**: advisory LLM via bank-approved in-region hosting with guardrails; spend-categorization & propensity models; age-progression model for consented photo avatars; Indic voice via Bhashini/Sarvam (11 languages)
- **Integrations**: Account Aggregator (FIU), UPI autopay/e-NACH mandates, e-sign, LIC & MF order APIs, CRM
- **Security/Compliance**: ephemeral-token auth (no keys on device), consent ledger, immutable audit log, model registry, PII vault

---

## Slide 10 — Implementation Cost

| Phase | Scope | Duration | Indicative cost |
|---|---|---|---|
| **PoC (done)** | Working app + live voice, deployed publicly | — | ~₹0 (public tooling) |
| **Sandbox pilot** | IDBI sandbox, mock core-banking + AA test rig, 1,000-user beta | 3–4 months | ₹40–60L |
| **Production v1** | GO Mobile+ integration, compliance sign-off, 2 → 11 languages | 6–9 months | ₹3–5 Cr (year 1) |

**Unit economics:** serving cost ≈ **₹50–100 per advised customer per year** (LLM + infra) vs. ₹15,000+ for RM-led advice. Advisory for the "missing middle" becomes **profitable, not charitable** — break-even at ~0.1% AUM uplift on advised balances.

---

## Slide 11 — Prototype Snapshots

**Try it live — voice works for everyone, no setup: (earlier public demo, since retired)
Code: (superseded by this repository)

[Screenshot grid:]
- `12-voice-call-tool.png` — caption: *Spoken aloud by the avatar mid-call: "With twenty thousand a month, you're on track for about five crore sixty-one lakh… markets do wobble, but you've got thirty-one years." **The slider moved itself.***
- `07-future-self-high.png` — the Future Self planner at high coverage
- `08-explainability.png` — "Why this advice?" audit panel
- `13-sip-confetti.png` — one-tap SIP commitment

---

## Slide 12 — Performance Metrics

**Business (what the bank gains):**
- SIP conversion uplift vs. control (research benchmark: future-self exposure ≈ 2× allocation; pilot target **+30–50%**)
- Advised-customer AUM & fee income; insurance attach rate via LIC shelf
- Cost per advised customer (**<₹100/yr target**) · NPS & retention delta

**Product:**
- Onboarding completion (<60s, >70% target) · nudge → action conversion · % of idle surplus mobilized
- Voice-session engagement & repeat-call rate

**Model & compliance (what the regulator asks):**
- **100%** of recommendations pass the suitability gate (hard requirement)
- **100%** of advice carries a stored explanation · advice-quality audit pass rate · P95 voice latency <2s

---

## Slide 13 — Future Development

- **Your real face**: consented selfie → true age-progressed avatar (the science shows *your own* face is what moves behaviour — Hershfield Study 2)
- **Cross-session memory**: the future self remembers previous conversations ("Did you move that idle ₹92,000 we discussed?")
- **Vocal-emotion awareness**: detect distress in the customer's voice → soften guidance, auto-offer human RM (compliance synergy)
- **Full 11-language voice** matching GO Mobile+; WhatsApp & branch-kiosk channels for B30 reach
- **Family mode**: joint goals — child's education, parents' health corpus
- **LIC annuity glide path**: as customers age, advice shifts from accumulation to guaranteed income
- **"Your Money Year"**: shareable Wrapped-style annual recap — no Indian bank has one

---

## Slide 14 — Project Links

- **Live demo (voice enabled for everyone):** (earlier public demo, since retired)
  - *Tap "🎙 Talk to future you" and say: "What if I invest twenty thousand a month?"*
- **GitHub:** (superseded by this repository)
- **Walkthrough video:** [add 2-min video link — record with sound; lead with the voice moment]

---

### Sources and anticipated questions (not slide content)
- **Sources for claims**: Deloitte India wealth report (AUM 2×); AMFI monthly data (SIP ₹31–32k Cr); Sahamati (25.29 Cr AA users); Motilal Oswal (~3% MF penetration); Hershfield et al., JMR 2011, DOI 10.1509/jmkr.48.SPL.S23; MIT Media Lab "Future You," arXiv 2405.12514; BoB Aditi press release (Sep 2024); NatWest Cora gen-AI pilot (+150% CSAT); SEBI Intermediaries Amendment 2025; SEBI AI/ML consultation Jun 2025; IDBI FY26 results (retail ~61%).
- **"Why won't the avatar creep people out?"** → We degrade the *world*, never the face; the future self is warm, grateful, aspirational (Prudential's 2025 Flash Forward uses the same framing). Stylized rendering avoids the uncanny valley; photo-real is opt-in later.
- **"What about AI giving bad advice?"** → The LLM never decides — a deterministic suitability gate does. 100% of advice is explained and logged; SEBI's 2025 framework is designed into the architecture.
- **"Voice costs?"** → ₹50–100/customer/year at scale; PoC already runs on ephemeral tokens with rate limiting.
