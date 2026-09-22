# Phase 2 submission kit — Dhan Sarthi

**Everything needed to build the Prototype Submission Deck and fill the Hack2skill form,
in one folder.** Point a design agent at this directory and it has the copy, the palette,
the diagrams and 50 real screenshots without needing the rest of the repository.

IDBI Innovate 2026 · Problem Statement 1: Digital Wealth Management · **Team Atomic**
Assembled 22 September 2026.

---

## Read in this order

| File | What it is |
|---|---|
| **[`BLOCKERS.md`](BLOCKERS.md)** | 🔴 **Read first.** Four things that are not done. Two form fields cannot be truthfully filled until they are |
| **[`SLIDES.md`](SLIDES.md)** | Every word that goes on a slide, in template order. This is the deck |
| **[`BRAND.md`](BRAND.md)** | Palette (from the app's own `tokens.json`), type scale, layout rules, and what never to draw |
| **[`DIAGRAMS.md`](DIAGRAMS.md)** | The three drawings — process flow, architecture, the gate — specified shape by shape, with Mermaid source |
| **[`assets/INDEX.md`](assets/INDEX.md)** | 50 screenshots, what each one shows, which slide wants it |
| **[`FORM-ANSWERS.md`](FORM-ANSWERS.md)** | The portal fields, paste-ready, with exact character counts |
| **[`DEMO-SCRIPT.md`](DEMO-SCRIPT.md)** | The 3-minute video: a printable cue card, then what to say on each screen |
| **[`CONVERSATION-PLAN.md`](CONVERSATION-PLAN.md)** | Planning the avatar call: the verified question bank, what makes a question work, rehearsal and pre-flight |

---

## If you only read one paragraph

Dhan Sarthi reads twenty-four months of a customer's bank statement — no questionnaire —
and each day tells them the one thing to do. **Its differentiator is that it says no:**
nine deterministic rules sit between the advice and IDBI's product shelf, and when the
shelf offers something that does not suit the customer the app refuses it, names something
cheaper, and writes the refusal into a hash-chained record. It does this *about products
IDBI itself sells.* An avatar called Uday phrases the verdict and never decides it.

**The deck's job is to make one screen unforgettable:**

> ### "I'm not going to sell you that."
> Not suitable · rule 9 of 9 · *"IDBI sells this one and I am still telling you not to buy
> it. Take term cover at ₹985 a month and invest the rest where you can see it."*

Everything else — the market size, the architecture, the tech stack — is there to make a
jury believe that screen is real. It is:
`assets/refusals/02-HERO-refusal-rule9-rohan.png`.

---

## The template, and the slide this phase turns on

The official deck is 14 slides. Phase 2 adds one that Phase 1 did not have:

> **Slide 13 — Improvements done during the 2nd Prototype phase**

The jury has read the Phase 1 submission. This is the slide they check first, and it is
where the strongest material lives — including **an honest cut**: Phase 1's headline
feature, an age-progressed "future self" avatar, was killed because a face you meet once
is a moment, not a product. Teams that only add features look like teams that never
decided anything. Say it out loud.

The other thing to lead with on that slide, because it is the hardest claim in the field
to fake: **we integrated IDBI's actual sandbox.** Twenty-four operations across
twenty-nine paths, mapped from forty-two captured live response bodies — because
twenty-eight of IDBI's twenty-nine OpenAPI exports declare `responses: {}` and never say
what comes back. Two of the bank's own customers, read live.

---

## Numbers you may use

Every one is checkable in this repository. **Do not round them, and do not invent siblings
for them.**

| | |
|---|---|
| Suitability rules | **9**, ordered, deterministic, earliest failure wins |
| Tests passing | **635** — core 188 · contracts 22 · fixtures 164 · api 211 · mobile 50 |
| API routes | **51**, every one declared in the registry that also generates the OpenAPI document |
| Keys on the client | **0** |
| IDBI sandbox | **24 operations** across **29 paths**, from **42 captured bodies**; **2** real bank customers read live; **6-call** AA flow + 2 webhooks |
| Live-call gate latency | **665 ms**, model tool call → rules answered, on a billed call (3 Sep 2026, session `3477379d…`) |
| Sandbox latency | **~2.4 s** live · **17 ms** replaying captured responses |
| Categorisation | **>98%** coverage, **0** disagreements with the bank's own labels |
| Generated data | **4** customers × **24 months**, seeded and deterministic |
| Action vocabulary | **13**, closed. A model may never emit one outside it |
| Cost per advised customer | **≈₹50–100/year** vs **₹15,000+** RM-led |
| ADRs | **14** |

**Claims to avoid.** No barge-in (the provider documents it nowhere). No Hindi in this
build (the engine takes it as a data file; it does not ship). No guarantee the model calls
the tool on every turn — we reconcile the transcript against our tool ledger and record the
coverage. No browser end-to-end suite. **Every one of these is stated openly on slide 11,
and that is deliberate:** a deck that names its own gaps is believed about everything else.

---

## Deeper sources, if a slide needs more

Nothing below is required. It is where a figure came from.

| For | Read |
|---|---|
| The whole product, best single page | [`../../../README.md`](../../../README.md) |
| Why the future-self avatar was cut | [`../../product/autopilot.md`](../../product/autopilot.md) |
| Every design decision and what it costs to reverse | [`../../product/decisions.md`](../../product/decisions.md) |
| The live call, with the provider's own record | [`../../engineering/avatar-live-call.md`](../../engineering/avatar-live-call.md) |
| What IDBI's sandbox really returns, and every trap | [`../../integration/idbi-sandbox.md`](../../integration/idbi-sandbox.md) |
| Where every data constant came from | [`../../engineering/data-calibration.md`](../../engineering/data-calibration.md) |
| Market, competitor and regulatory research | [`../research.md`](../research.md) |
| The Phase 1 deck, for the diff | [`../phase-1-deck.md`](../phase-1-deck.md) |

---

## Housekeeping

- **Synthetic data only.** Every customer, transaction and balance in the screenshots is
  generated from a seed. No IDBI customer data, no personal data. Say so on slide 14
- **Not a registered adviser.** Dhan Sarthi is a prototype. It implements the
  product-appropriateness check a distributor already performs. Nothing here has been
  reviewed by IDBI's compliance function or any regulator. Do not let a slide imply
  otherwise
- **The PDF must come in under 5 MB.** `assets/` alone is 12 MB; downsample on export
