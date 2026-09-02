/**
 * The shell.
 *
 * Four tabs plus the advisor, and one rule that shapes the whole file: **Ask Uday takes the
 * screen.** No tab bar, no header, no card around it. A conversation with a person does not
 * happen inside a panel, and the avatar is the strongest thing we have — so it gets the glass.
 */
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Action } from '@dhan/core'
import { TabBar } from './components/TabBar.tsx'
import type { TabId } from './components/TabBar.tsx'
import { Ask } from './screens/Ask.tsx'
import { Money } from './screens/Money.tsx'
import { Pick } from './screens/Pick.tsx'
import { Plan } from './screens/Plan.tsx'
import { Record } from './screens/Record.tsx'
import type { AuditEntry } from './screens/Record.tsx'
import { Today } from './screens/Today.tsx'
import { advance, useSession } from './lib/session.ts'
import { buildView } from './lib/view.ts'

export function App(): ReactNode {
  const [session, patch, reset] = useSession()
  const [tab, setTab] = useState<TabId>('today')
  const [audit, setAudit] = useState<AuditEntry[]>([])

  const view = useMemo(() => buildView(session), [session])

  if (!view) {
    return (
      <div className="app">
        <Pick onPick={(slug) => patch({ slug })} />
      </div>
    )
  }

  const decide = (action: Action, kind: 'did_it' | 'declined'): void => {
    setAudit((prev) => [
      ...prev,
      {
        actionId: action.id,
        label: action.label,
        kind,
        at: session.asOf,
        amount: action.amount,
        ...(action.productName ? { productName: action.productName } : {}),
        evidence: action.evidence,
        // The sentence, not the product code. An audit trail recording "recommended
        // MF_INDEX_103" cannot answer the only question a regulator asks, which is what the
        // customer was actually told.
        shown: action.detail,
      },
    ])

    patch(
      kind === 'did_it'
        ? { accepted: [...session.accepted, action.id] }
        : { declined: [...session.declined, action.id] },
    )

    // Accepting a spending cap is the one action that changes the daily plan immediately, so it
    // is recorded as a cap rather than only as a decision.
    if (kind === 'did_it' && action.kind === 'set_category_cap') {
      const trend = view.snapshot.discretionary.categoryTrends[0]
      if (trend) {
        patch({
          accepted: [...session.accepted, action.id],
          caps: [
            ...session.caps.filter((c) => c.category !== trend.category),
            { category: trend.category, monthlyLimit: trend.prior },
          ],
        })
      }
    }
  }

  // Full bleed. Everything else in the app is inside the shell; this is the shell.
  if (tab === 'ask') {
    return (
      <div className="app">
        <Ask snapshot={view.snapshot} onClose={() => setTab('today')} />
      </div>
    )
  }

  return (
    <div className="app">
      {tab === 'today' ? (
        <Today
          snapshot={view.snapshot}
          plan={view.plan}
          accepted={session.accepted}
          declined={session.declined}
          asOf={session.asOf}
          onAdvance={(days) => patch(advance(session, days))}
          onReset={reset}
          onDecide={decide}
          onAsk={() => setTab('ask')}
        />
      ) : null}

      {tab === 'plan' ? <Plan snapshot={view.snapshot} roadmap={view.roadmap} /> : null}
      {tab === 'money' ? <Money snapshot={view.snapshot} file={view.file} /> : null}
      {tab === 'record' ? <Record view={view} audit={audit} /> : null}

      <TabBar active={tab} onChange={setTab} />
    </div>
  )
}
