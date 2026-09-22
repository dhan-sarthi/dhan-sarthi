// One statement line, opened.
//
// Cleo's transaction detail: the amount large, what it was for, a white table of what the bank
// recorded about it, and a way to ask about it. It is a sheet rather than a route because the
// customer who taps a line wants the list still there, still scrolled, when they put it away.
//
// Every row in the table is a field the line itself carries; nothing is worked out. So the
// table is as long as the line is informative: a value date only on a card line, which posts
// the day after the purchase; a UPI ID only where the payment had one; the account only for a
// customer whose lines come from more than one, where "balance after" would otherwise leave
// them guessing whose balance it is.
//
// Two ways on, both conditional on purpose. Uday is asked what he can total about the line
// (`lib/ask.ts`) — its category over the period that holds it, what is safe to spend once pay
// lands — and a transfer, a refund or a charge, which he has no answer for, gets no link: the
// table is the answer. "Set a limit for…" appears only on a debit a limit can steer
// (`isDiscretionary`), not on every recurring line: an EMI, a rent mandate or a SIP recurs too,
// but the limit screen has no row for any of them, and a button that lands on a screen that
// ignores it is worse than none. The salary recurs as well, and "Set a limit for Income" is
// nonsense.
//
// The sheet keeps the last line it showed while it fades out, so the card leaves with its
// contents instead of collapsing to an empty sheet on the way down.
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { Sheet } from '~/ui/Sheet'
import { Type } from '~/ui/Text'
import { Card } from '~/ui/Card'
import { Row } from '~/ui/Row'
import { Chip } from '~/ui/Chip'
import { Button } from '~/ui/Button'
import { AskUday } from '~/ui/AskUday'
import { useSnapshot } from '~/state/snapshot'
import { isDiscretionary, merchantOf } from '~/lib/merchant'
import { fullDate, splitAmount } from '~/lib/money'
import { questionForLine } from '~/lib/ask'
import type { Account, Transaction } from '@dhan/contracts'

type TxnMode = Transaction['txnMode']

/**
 * What each rail is called to a customer.
 *
 * The rails a passbook already names — UPI, NEFT, IMPS — keep their names; the two mandate rails
 * say what they do instead. `UNKNOWN` is IDBI's own statement, which sends no mode at all, and
 * the honest word for that is that it was not recorded.
 */
export const MODE_LABEL: Record<TxnMode, string> = {
  UPI: 'UPI',
  CARD: 'Card',
  NEFT: 'NEFT',
  IMPS: 'IMPS',
  'ACH-D': 'Auto-debit',
  SI: 'Standing instruction',
  CASH: 'Cash',
  CHQ: 'Cheque',
  UNKNOWN: 'Not recorded',
}

export function TransactionSheet({
  txn,
  asOf,
  onClose,
}: {
  /** The line to show; null closes the sheet. */
  txn: Transaction | null
  /** The simulated today, so a date in another year prints its year. */
  asOf?: string | undefined
  onClose: () => void
}) {
  const { data } = useSnapshot()
  const [held, setHeld] = useState<Transaction | null>(txn)
  useEffect(() => {
    if (txn !== null) setHeld(txn)
  }, [txn])
  const shown = txn ?? held

  return (
    <Sheet
      open={txn !== null}
      onClose={onClose}
      title={shown === null ? '' : merchantOf(shown)}
      {...(shown === null ? {} : { footer: <Actions txn={shown} asOf={asOf} onClose={onClose} /> })}
    >
      {shown === null ? null : <Detail txn={shown} accounts={data?.accounts} />}
    </Sheet>
  )
}

function Detail({ txn, accounts }: { txn: Transaction; accounts: readonly Account[] | undefined }) {
  const credit = txn.txnType === 'CREDIT'
  const { whole, paise } = splitAmount(txn.txnAmount)
  const account = accountName(txn.accountNumberMasked, accounts)
  const facts: Fact[] = [
    { label: 'Date', value: fullDate(txn.txnDate) },
    ...(txn.valueDate === txn.txnDate
      ? []
      : [{ label: 'Value date', value: fullDate(txn.valueDate) }]),
    { label: 'Mode', value: MODE_LABEL[txn.txnMode] },
    { label: 'Recurring', value: txn.isRecurring ? 'Yes' : 'No' },
    ...(account === null ? [] : [account]),
    txn.balanceAfterTxn === null
      ? { label: 'Balance after', value: '—', spoken: 'Not recorded' }
      : { label: 'Balance after', value: exact(txn.balanceAfterTxn) },
    ...(txn.counterpartyVpa === undefined ? [] : [{ label: 'UPI ID', value: txn.counterpartyVpa }]),
  ]

  return (
    <>
      <View
        accessible
        accessibilityLabel={`${credit ? 'Received' : 'Paid'} ${whole}${paise}`}
        className="flex-row items-baseline"
      >
        <Type role="display" plain tone={credit ? 'brand' : 'ink'}>
          {credit ? '+' : ''}
          {whole}
        </Type>
        {paise ? (
          <Type role="heading" plain tone={credit ? 'brand' : 'mid'}>
            {paise}
          </Type>
        ) : null}
      </View>
      <Type role="body" tone="mid" className="mt-xs">
        {txn.spendCategory}
      </Type>

      <Card className="mt-lg">
        <View accessible accessibilityLabel={`Status, ${credit ? 'Received' : 'Paid'}`}>
          <Row
            label="Status"
            emphasis="label"
            trailing={<Chip tone="success">{credit ? 'Received' : 'Paid'}</Chip>}
          />
        </View>
        {facts.map((fact) => (
          <View
            key={fact.label}
            accessible
            accessibilityLabel={`${fact.label}, ${fact.spoken ?? fact.value}`}
          >
            <View className="mx-lg h-px bg-hairline" />
            <Row label={fact.label} value={fact.value} emphasis="label" />
          </View>
        ))}
      </Card>

      <Type role="caption" tone="mid" selectable className="mt-md">
        On your statement: {txn.narration}
      </Type>
    </>
  )
}

function Actions({
  txn,
  asOf,
  onClose,
}: {
  txn: Transaction
  asOf: string | undefined
  onClose: () => void
}) {
  const credit = txn.txnType === 'CREDIT'
  // Uday cannot look up one line — "What was the ₹410 to Spencer Retail?" came back "I am not
  // sure" every time — so he is asked what he can total: the line's category over the period
  // that holds it, what is safe to spend once pay lands, what savings pay. A transfer, a refund
  // or a charge has nothing he answers, and the table above is the whole answer.
  const question = questionForLine(txn, asOf)
  const limitable = !credit && isDiscretionary(txn.spendCategory)
  if (question === null && !limitable) return null

  // Cleo's shape: the thing to do is the button, and "Ask Uday about this" is the link under it
  // — or the only action, as "What's this transaction?" is on a salary line. The sheet opens on
  // /statement as well as on Spend and Grow; AskUday picks the way to Uday from the side of the
  // tabs it was opened on, and closes the sheet first so the chat does not open underneath it.
  return (
    <View>
      {limitable ? (
        <Button
          label={`Set a limit for ${txn.spendCategory}`}
          haptic="none"
          onPress={() => {
            onClose()
            router.push({ pathname: '/set-limit', params: { category: txn.spendCategory } })
          }}
        />
      ) : null}
      {question === null ? null : (
        <AskUday
          question={question}
          onBefore={onClose}
          {...(limitable ? { className: 'mt-xs' } : {})}
        />
      )}
    </View>
  )
}

/** One row of the table. `spoken` stands in for a value that reads badly aloud. */
type Fact = { label: string; value: string; spoken?: string }

/**
 * Which account carried the line, when the customer's lines come from more than one.
 *
 * Named by its bank where the view knows the account, and by its last four digits alone where
 * it does not — "IDBI" is only true of an account the view has actually listed. The row says
 * the bank without its "Bank": at 320pt "Kotak Mahindra Bank ••6031" pushed the label down to
 * three letters a line. VoiceOver still hears the whole name.
 */
function accountName(
  masked: string | undefined,
  accounts: readonly Account[] | undefined,
): Fact | null {
  if (masked === undefined) return null
  const last4 = masked.slice(-4)
  const account = accounts?.find((a) => a.accountNumberMasked === masked)
  const bank = account === undefined ? null : (account.institution?.name ?? 'IDBI Bank')
  if (bank === null) return { label: 'Account', value: `••${last4}`, spoken: `ending ${last4}` }
  return {
    label: 'Account',
    value: `${bank.replace(/\s+Bank$/i, '')} ••${last4}`,
    spoken: `${bank}, ending ${last4}`,
  }
}

/** A balance to the paisa, signed: this is the table a customer checks against a passbook. */
function exact(n: number): string {
  const { whole, paise } = splitAmount(n)
  return `${n < 0 ? '−' : ''}${whole}${paise}`
}
