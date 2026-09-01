# UI reference shots

Captured headless with Playwright against the running dev server:

```bash
cd automation && node shoot-ui.cjs
```

| File | What it shows |
|---|---|
| `01-full.png` | The whole page — marketing rail plus the phone frame |
| `02-chat.png` | Adviser. The conversation, opening on a diagnosis rather than a pitch |
| `03-money.png` | Money. The 360° view, every figure from the shared snapshot |
| `03-future.png` | Future Self. Projection, slider, and 2057 prices |
| `03-record.png` | Advice register. Every decision and whether the gate passed it |
| `04-refusal.png` | The refusal — the ULIP declined, with a cheaper alternative named |

Re-run after any UI change. Building an interface without looking at it is how the chat
screen spent a day rendering behind an onboarding flow nobody had disabled.
