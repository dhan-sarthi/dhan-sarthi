// An answer, with its numbers set in bold.
//
// The reference gets its hierarchy inside the paragraph rather than by resizing it: the
// payload of a sentence — the figure, the count, the percentage — is a semibold run inside
// regular body copy, and the sentence around it stays one size. That is what let us drop
// the answer from 26pt bold to 18pt regular without losing the emphasis; the weight moved
// off the whole paragraph and onto the four things in it that are actually the answer.
//
// It matters more here than it does there. This product's entire claim is "here is the
// number and here is where it came from", and until now every word of an answer carried
// identical weight — the rupee figure the customer asked for was typeset exactly like the
// conjunctions around it.
//
// Done client-side on purpose. `Answer.text` is a plain string from `packages/core`, and
// emitting segments instead would be a contract change for a typographic want. That was
// once also an argument about the frozen `apps/web`, which was served the same string; with
// the browser app deleted the contract argument stands on its own. The regex only ever adds
// weight, so the failure mode of a miss is the sentence it renders today.
import { Fragment } from 'react'
import { Text } from 'react-native'
import { Type, type TypeProps } from '~/ui/Text'

/**
 * Rupee amounts (`₹8,14,315`, `₹1,92,000/month`), percentages (`34.8%`), and bare counts
 * with a unit (`3 months`, `12 payments`). Deliberately not "any number": a year in
 * `2026-08-01` or an account's last four digits is not the payload of a sentence, and
 * bolding it would make the emphasis meaningless.
 */
const FIGURE =
  /(₹[\d,]+(?:\.\d+)?(?:\s?(?:lakh|crore))?|\d+(?:\.\d+)?%|\b\d+\s(?:months?|days?|years?|payments?|weeks?)\b)/gi

export function AnswerText({ text, ...rest }: { text: string } & Omit<TypeProps, 'children'>) {
  const parts = text.split(FIGURE)

  return (
    <Type {...rest}>
      {parts.map((part, i) =>
        // `split` with one capture group alternates literal, capture, literal… so the odd
        // indices are the figures. Comparing against the pattern again would need the
        // lastIndex reset that a /g regex carries between calls.
        i % 2 === 1 ? (
          <Text key={i} className="font-semibold">
            {part}
          </Text>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </Type>
  )
}
