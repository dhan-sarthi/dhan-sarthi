/**
 * One statement line, and where every word of it came from.
 *
 * Money's stated job is that any figure on Today or Plan can be traced back to something the
 * bank actually sent, and the list was the one place that quietly broke the promise: it shows a
 * tidy merchant name recovered from a narration by a pile of heuristics, and offered no way to
 * see the narration. "Swiggy" is a guess about `UPI/DR/824112340987/SWIGGY/ICIC/...`, a good one,
 * but a guess — so this sheet prints the raw line and says which of the two produced the name.
 *
 * Everything here is already on the row. There is no call behind this sheet and no new field on
 * the wire; it is the same object the list is rendering, shown in full.
 */
import type { ReactNode } from 'react'
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import type { Transaction } from '@dhan/contracts'
import { Sheet } from '../components/Sheet.tsx'
import { Leader, Pill } from '../components/ui.tsx'
import { inr, longDate } from '../lib/money.ts'
import { merchantOf, narratedName } from '../lib/merchant.ts'

const NOTE = 'text-xs leading-relaxed text-ink-soft'

export function TransactionSheet({
  txn,
  onClose,
}: {
  /** Null when nothing is open. The sheet owns its own mount, so the caller only holds the row. */
  txn: Transaction | null
  onClose: () => void
}): ReactNode {
  /*
   * The last row stays rendered through the closing animation. Without it the sheet empties on
   * the tick the caller clears the selection and the exit plays against a blank panel.
   */
  const credit = txn?.txnType === 'CREDIT'

  return (
    <Sheet
      open={txn !== null}
      onClose={onClose}
      title={txn === null ? '' : merchantOf(txn)}
      {...(txn === null ? {} : { sub: longDate(txn.txnDate) })}
    >
      {txn === null ? null : (
        <>
          <div className="flex items-center gap-3 pt-1">
            <span
              className={`grid size-11 flex-none place-items-center rounded-pill ${
                credit ? 'bg-tint-sage text-good' : 'bg-ground-deep text-ink-mid'
              }`}
            >
              {credit ? (
                <ArrowDownLeft size={22} strokeWidth={2.4} />
              ) : (
                <ArrowUpRight size={22} strokeWidth={2.4} />
              )}
            </span>
            <div className="min-w-0">
              <div
                className={`text-[28px] font-bold leading-none tracking-tight tabular-nums ${
                  credit ? 'text-good' : 'text-ink'
                }`}
              >
                {credit ? '+' : '−'}
                {inr(txn.txnAmount)}
              </div>
              <p className="m-0 mt-1.5 text-[13px] text-ink-soft">
                {credit ? 'Into your account' : 'Out of your account'}
              </p>
            </div>
          </div>

          <div className="mt-3.5 flex flex-wrap gap-2">
            <Pill>{txn.spendCategory}</Pill>
            {txn.txnMode === 'UNKNOWN' ? null : <Pill>{txn.txnMode}</Pill>}
            {txn.isRecurring ? <Pill tone="warn">Recurring</Pill> : null}
            {txn.isSalaryCredit ? <Pill tone="ok">Salary</Pill> : null}
          </div>

          {/* ------------------------------------------------ The raw line */}
          <p className="mb-1.5 mt-5 text-[11.5px] font-bold uppercase tracking-wide text-ink-soft">
            As the bank wrote it
          </p>
          <p className="m-0 break-words rounded-sm bg-ground-deep px-3 py-2.5 font-mono text-[12.5px] leading-relaxed text-ink">
            {txn.narration}
          </p>
          {/* Three cases, because they are three different claims. The bank naming a merchant
              is a fact; a name recovered from a narration is a good guess; and a line that names
              nobody supports neither, so the sheet says so instead of dressing up "Money out" as
              something it read. */}
          <p className={`${NOTE} mb-0 mt-2`}>
            {txn.merchantName !== undefined
              ? `The bank sent "${txn.merchantName}" as the merchant, so that is the name shown rather than anything read out of the line.`
              : narratedName(txn.narration) !== null
                ? `"${merchantOf(txn)}" is read out of that line. The bank sent no merchant name for it.`
                : 'Nothing in that line names who was paid, and the bank sent no merchant name, so the direction of the money is all there is to go on.'}
          </p>

          {/* ------------------------------------------------ The rest of the row */}
          <div className="mt-5">
            <Leader label="Posted" value={longDate(txn.txnDate)} filled />
            {txn.valueDate !== txn.txnDate ? (
              <Leader label="Valued" value={longDate(txn.valueDate)} />
            ) : null}
            {txn.balanceAfterTxn !== null ? (
              <Leader label="Balance after" value={inr(txn.balanceAfterTxn)} />
            ) : null}
            {txn.counterpartyVpa !== undefined ? (
              <Leader label="Paid to" value={txn.counterpartyVpa} />
            ) : null}
            {txn.mccCode !== undefined ? (
              <Leader label="Merchant code" value={txn.mccCode} />
            ) : null}
            <Leader label="Reference" value={txn.txnId} />
          </div>

          {txn.balanceAfterTxn === null ? (
            <p className={`${NOTE} mt-3`}>
              No running balance on this one. The bank sends one, but it did not reconcile against
              the account&rsquo;s own balance across this statement, so it is withheld rather than
              shown as though it had been checked.
            </p>
          ) : null}

          <p className={`${NOTE} mt-3`}>
            {narratedName(txn.narration) === null && txn.merchantName === undefined
              ? `The category is this app’s, not the bank’s, and with nothing in the line to read it falls back to ${txn.spendCategory}. The spending figures are built on it, which is worth knowing when they all look the same.`
              : 'The category is this app’s, not the bank’s. It is worked out from the line above and it is what the spending figures are built on, so it is worth a look if one of them surprises you.'}
          </p>
        </>
      )}
    </Sheet>
  )
}
