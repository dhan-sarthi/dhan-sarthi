# Design direction

`DESIGN.md` is the mechanical reference: tokens, utility strings, component recipes. This file is
the judgment above it — what the app should look like and why, and the specific mistakes that put
it where it was.

## Where it was, honestly

An anti-slop pass on the Today screen found four strong signals, which is high-confidence generic
output:

- uniform radius on every element
- identical padding on every component
- every section is a card with the same treatment, some nested inside others
- the hero-metric shape (huge number, small label) repeated down the page

The copy was never the problem: it is specific, opinionated and carries real figures. The palette
was not the problem either. The problem was that **every block on the page had the same visual
weight**, so nothing led, and a vertical stack of identical rounded cards is precisely the shape
machine-written UI takes.

## The direction

**Adopt IDBI GO Mobile+'s own visual language, and let the advisory layer be the calmer, more
confident half of it.**

This is the one move that solves both problems at once. The bank's app already differentiates
surfaces by role — a solid account card with a wave motif is nothing like a favourites tile, which
is nothing like a form row. Borrowing that vocabulary makes our screens less generic *and* makes a
banker feel the module belongs inside their app. Chasing a generic "premium fintech" look would
have done the opposite on both counts.

We take the bank's structure. We do not take its faults: the truncated labels, the raw database
timestamp on the greeting, the floating button that covers content, the four competing type sizes
in one card.

```
Direction: bank-native — IDBI's surfaces, an adviser's composure
Density:   comfortable, tightening to compact in lists and ledgers
Surface:   role-differentiated. A hero panel, hairline cards, and bare rows are three different things
Type mood: modest, confident, one voice — the bank shouts less than a consumer app and so do we
Motion:    quiet and physical. Things arrive; nothing bounces
```

**Do**

- Give the day's one number a surface nothing else on the page has: the deep green panel with the
  wave, white on green, the figure large enough to read across a desk.
- Carry the wave. It is IDBI's single most recognisable mark and it costs one inline SVG.
- Differentiate by role: hero panel → hairline card → bare row. Radius, ground and border all
  change with the role, never uniformly.
- Use the legend chip for section titles, sitting on the card edge as the bank does.
- Draw insight and tab icons two-tone: a green stroke with one orange element, as every icon in
  GO Mobile+ is drawn.
- Let the eye land on one thing per screen. Everything else is support.

**Don't**

- Wrap a card in a card. If a block needs a container it is probably a row.
- Reach for a new accent. Green is structure, orange is action, and nothing else earns a colour.
- Give the simulated clock hero placement. It is a reviewer's control, not the customer's headline;
  it belongs in a compact bar that reads as an instrument, not as advice.
- Animate for its own sake. The figure counts up because it is being computed in front of you; a
  card fades up because it just arrived. Nothing else moves.
- Add a motion library. CSS transitions, one count-up hook, and `prefers-reduced-motion` respected
  everywhere; a bank build should not carry 50 KB for a fade.

## The hierarchy, per screen

| Screen | The one thing | Everything else |
|---|---|---|
| Today | Safe to spend, on the green panel | The action, then what changed, then what was noticed |
| Plan | The destination and the shortfall | The route as a spine, the band as evidence |
| Money | Net position | Accounts as a card deck; spending and commitments as ledgers |
| Record | The chain is verified | Decisions as a timeline, rules as reference |
| Ask | Uday's face and the one button | The transcript, then the suggestions |
| Pick | Three people | Everything else is a footnote |

## Motion

Entry is longer than exit. Nothing bounces; a bank does not bounce.

| Moment | Behaviour |
|---|---|
| Screen arrives | Cards fade and rise 8px, staggered 40ms, 320ms each |
| The figure | Counts up over 600ms, eased out, only on first paint and when the clock moves |
| Clock advances | The panel cross-fades over 200ms so the new day reads as recomputed, not swapped |
| A decision is taken | The card settles and the record chip ticks up; no confetti |
| Press | Scale to 0.985 for 100ms — the whole feedback budget for a tap |

Every one of these is skipped under `prefers-reduced-motion: reduce`.
