/**
 * Add a Member — the invite form, `04-add-family-member`.
 *
 * The reference's screen is one field and a button with 45% of the page deliberately blank, and
 * that restraint is right: identifying someone by Customer ID is a single decision and padding it
 * with cards would make it look like more of one. So the composition is kept — H1, helper line,
 * one outlined field, a long gap, a grey notice above a pinned primary — with the field and the
 * button in this app's shapes rather than Material's.
 *
 * Two changes to the words.
 *
 * **The footer notice loses its typo.** The frame reads `Your request will be notified to the
 * member In their App`, with a capital `I` mid-sentence. It is transcribed verbatim in the spec
 * and it is a bug in their build, not a house style.
 *
 * **A second line is added, and it is the point of this screen existing at all.** There is no
 * household in IDBI's records and no request will leave the app. `07-DECISIONS.md` §5 allows the
 * surface to run on demo state and forbids it from claiming otherwise, so the screen says which it
 * is, in the register the simulated clock uses — an accent eyebrow over a plain sentence, said
 * once, at the top, where it is read before anything is typed rather than after.
 *
 * The header is the mint slab, not `tone="brand"`. `DESIGN.md` is explicit that the green bar
 * exists for the overlap and for nothing else, and nothing overlaps anything here.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Screen } from '../../components/Screen.tsx'
import { Field, TextInput } from '../../components/Form.tsx'
import { Button, Head } from '../../components/ui.tsx'
import { isCustomerId } from './household.ts'

export function AddMember({
  onBack,
  onSend,
}: {
  onBack: () => void
  onSend: (customerId: string) => void
}): ReactNode {
  const [id, setId] = useState('')
  const ok = isCustomerId(id)
  const touched = id.trim().length > 0

  return (
    <Screen
      header={<Head onBack={onBack} backLabel="Back to Family Wealth" title="Add a Member" />}
      footer={
        <>
          {/* Their footer notice, minus its capital `I`. */}
          <p className="mb-3 mt-0 text-center text-[13px] leading-snug text-ink-soft">
            Your request will be notified to the member in their app.
          </p>
          <Button full disabled={!ok} onClick={() => onSend(id.trim())}>
            Send Request
          </Button>
        </>
      }
    >
      {/* The clock's register: the eyebrow names what this is, the sentence says what it is not. */}
      <div className="mb-4 mt-1">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-accent-text">
          Demo flow
        </div>
        <p className="m-0 mt-1 text-[13px] leading-relaxed text-ink-soft">
          Nothing is sent. IDBI has no household in its records and no way to look a Customer ID up
          against one, so this is the flow and the consent rules behind it — not a live request.
        </p>
      </div>

      <h2 className="m-0 text-[22px] font-semibold leading-tight text-ink">
        Provide Customer ID of the family member
      </h2>
      <p className="mb-6 mt-1.5 text-[15px] leading-relaxed text-ink-soft">
        You can locate the Customer ID from the account details page.
      </p>

      <Field
        label="Customer ID"
        hint={
          touched && !ok ? 'A Customer ID is eight to twelve digits.' : 'Eight to twelve digits.'
        }
      >
        <TextInput
          value={id}
          onChange={setId}
          ariaLabel="Customer ID"
          placeholder="129209661"
          maxLength={12}
        />
      </Field>
    </Screen>
  )
}
