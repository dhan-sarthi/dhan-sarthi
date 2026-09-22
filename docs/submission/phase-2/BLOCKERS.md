# Before you submit — four things, checked 22 September 2026

These were verified by command, not assumed. Two of the four form fields cannot be
truthfully filled until #1 and #2 are done, and #3 is the one that decides whether the
judges see the app in the deck or a different, worse app.

---

## 1. 🔴 The repository is private

```
gh repo view dhan-sarthi/dhan-sarthi --json visibility  →  "PRIVATE"
curl -o /dev/null -w "%{http_code}" https://github.com/dhan-sarthi/dhan-sarthi  →  404
```

The form field says **"Github Repository Link (Public Access)"**. A logged-out judge gets
a 404 today.

```bash
gh repo edit dhan-sarthi/dhan-sarthi --visibility public --accept-visibility-change-consequences
```

**Before you flip it,** check that nothing secret is in the history:

```bash
git log --all --diff-filter=A --name-only --pretty=format: | sort -u | grep -Ei '\.env$|\.env\.local|secret|credential|\.pem$|\.p12$'
```

`.env` and `.env.local` are on disk with live Runway, Anam and OpenAI keys. Confirm they
are ignored and were never committed. `.env.example` is fine and should stay.

Verify after: the curl above must return `200`.

---

## 2. 🔴 The public default branch is the *old* codebase

```
origin/main   vs   HEAD (smartwealth-ui)   →   3 ahead, 106 behind
```

A judge who opens the repo lands on `main`. `main` still has the deleted web app and the
HDFC SmartWealth direction — **none of the work this deck describes.** The Expo app, the
nine rules as shipped, the IDBI sandbox adapter and 106 commits of product are on
`smartwealth-ui`.

Pick one:

```bash
# Option A (recommended) — merge the work into main, so the landing page is the product
git checkout main && git merge smartwealth-ui && git push origin main

# Option B (faster, uglier) — point the default branch at the work
gh repo edit dhan-sarthi/dhan-sarthi --default-branch smartwealth-ui
```

Either way the README a judge reads first is the current one. It is a genuinely strong
README — badges, the mermaid architecture, the nine-rule table, "try it in two minutes" —
and it is doing none of that work while it sits on a branch nobody lands on.

---

## 3. 🔴 The deployed app is a stale build — it does not look like this deck

**The deployment is live and healthy.** This is good news, and it is the answer to the
"Working Prototype Deployed Link" field:

```
https://d31q2ik7f7eu67.cloudfront.net          →  200
https://d31q2ik7f7eu67.cloudfront.net/api/v1/health  →  {"ok":true,"bank":{"source":"postgres","ok":true},"avatar":{"provider":"runway","enabled":true}}
```

CloudFront serves the Expo web export at `/` and proxies `/api/*` to the ALB in
`ap-south-1`. Terraform state: `infra/terraform`, env `team-sandbox`.

**But it is running an older build.** Screenshotted 22 Sep and compared with local:

| Deployed today | Local (and every screenshot in `assets/`) |
|---|---|
| First tab labelled **"Spend"** | **"Home"** |
| Three panes: Overview · Budget · Debt | Four: Overview · Budget · Debt · **Credit** |
| Salmon/orange hero card | IDBI green hero card — the current `tokens.json` |
| Savings ₹12,000 | ₹12,45,774 across four accounts |
| No credit view, no challenges, no net worth, no holdings | All present |

**Why:** there are **132 modified and 23 new files uncommitted on this laptop —
15,464 insertions.** The avatar credential pool and failover (`provider-router.ts`,
`credential-health.ts`), the IDBI sandbox failover, the profile screen, nine new UI
primitives and the current design tokens **exist only here.** They are not in the
repository and not in the deployed build.

If a judge opens the link and sees an orange app with three tabs while the deck shows a
green one with five, that is worse than no link at all.

```bash
# 1. Commit and push the work (it is the biggest single risk in this submission)
git add -A && git commit -m "…" && git push origin smartwealth-ui

# 2. Redeploy both halves
infra/scripts/deploy-api.sh team-sandbox
infra/scripts/deploy-web.sh team-sandbox      # expo export + S3 sync + CloudFront invalidation
infra/scripts/smoke.sh team-sandbox
```

Then re-shoot the screenshots against the deployed URL, not localhost, so the deck and the
link agree. The capture tool is in the scratchpad; point `WEB`/`API` at the CloudFront
origin.

> **Do #3 before you record the video.** Shooting the demo against localhost and linking a
> different build is the one mistake that makes a jury stop trusting the rest.

---

## 4. 🟠 Runway credits will not cover the shoot

A live avatar call bills ~2 credits up front and ~2 per 6 seconds. The 50-second take in
[`DEMO-SCRIPT.md`](DEMO-SCRIPT.md) is **≈19 credits**; three takes is **≈60**.

The agreed 100-credit test cap has **12 left** (88 used on 22 Sep, balance 440 → 352 on
the slot-1 account). Top up or raise the cap **before** the shoot day.

```bash
# balance, before and after every billed run
curl -s https://api.dev.runwayml.com/v1/organization -H "Authorization: Bearer $RUNWAY_API_KEY_1" | jq .creditBalance
```

Free: a session created and never consumed costs 0 credits, so the UI path can be
rehearsed without billing. Slots 2 and 3 (`RUNWAY_API_KEY_2/3`) are still blank — filling
them buys another ~500 free credits each and the failover router already tries them in
order.

---

## Order of operations

```
1. commit + push          ── unblocks everything else
2. merge to main          ── the repo now reads as the product
3. make public            ── verify 200 logged out
4. redeploy api + web     ── the link now matches the deck
5. re-shoot screenshots   ── against the deployed URL
6. build the deck         ── from SLIDES.md
7. top up Runway          ── then record the video
8. fill the form          ── FORM-ANSWERS.md
```

Steps 1–4 are outward-facing and irreversible-ish. None of them has been done for you.
