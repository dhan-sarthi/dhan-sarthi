import type { RmCheckVerdict } from '@dhan/contracts'
import { ruleBook, ruleLabel } from '@dhan/core'
import { ShieldCheck, ShieldX } from 'lucide-react'
import { cn } from '../../lib/cn.ts'
import { Chip } from '../../ui/index.ts'
import { possessive } from './names.ts'

/**
 * The rules' verdict on a product the RM's question named, drawn apart from the answer around it.
 * The answer is phrased (perhaps by a model); this card is not: the verdict, the rule and the
 * sentence come back from `evaluate()` verbatim, and the card says so in its footer. A refusal is
 * shown at full strength, never softened into the prose: the verdict is a solid chip beside the
 * product's name, not a label stacked above it.
 */
export function VerdictCard({ verdict, name }: { verdict: RmCheckVerdict; name: string }) {
  const blocked = verdict.verdict === 'BLOCKED'
  const rule = verdict.ruleId
  const plain = rule ? ruleBook.find((r) => r.id === rule)?.description : undefined
  const Icon = blocked ? ShieldX : ShieldCheck

  return (
    <section
      aria-label={`The rules’ verdict on ${verdict.productName}`}
      className="overflow-hidden rounded-lg border border-hairline bg-surface"
    >
      <header
        className={cn(
          'flex items-start gap-3 px-4 py-3',
          blocked ? 'bg-danger-soft' : 'bg-brand-soft',
        )}
      >
        <Icon
          aria-hidden
          className={cn('size-5 shrink-0', blocked ? 'text-danger' : 'text-brand-deep')}
        />
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-heading text-ink">{verdict.productName}</p>
          <Chip className={blocked ? 'bg-danger text-on-brand' : 'bg-brand text-on-brand'}>
            {blocked ? 'Blocked' : 'Pass'}
          </Chip>
        </div>
      </header>

      <dl className="grid gap-3 px-4 py-3.5">
        {rule ? (
          <div className="grid gap-0.5">
            <dt className="text-caption-plain text-ink-faint">Rule</dt>
            <dd className="text-label text-ink">{ruleLabel(rule)}</dd>
            {plain ? <dd className="text-label-plain text-ink-soft">{plain}</dd> : null}
          </div>
        ) : null}
        {verdict.spoken ? (
          <div className="grid gap-1">
            <dt className="text-caption-plain text-ink-faint">
              What Uday would tell {name}, word for word
            </dt>
            <dd>
              <blockquote className="text-body text-ink">&ldquo;{verdict.spoken}&rdquo;</blockquote>
            </dd>
          </div>
        ) : (
          <div className="grid gap-0.5">
            <dt className="text-caption-plain text-ink-faint">On the record</dt>
            <dd className="text-label-plain text-ink">{verdict.recorded}</dd>
          </div>
        )}
      </dl>

      <p className="flex items-start gap-1.5 border-t border-hairline-soft bg-footer-wash px-4 py-2.5 text-caption-plain text-ink-faint">
        <ShieldCheck aria-hidden className="mt-px size-3.5 shrink-0 text-brand" />
        <span>
          <span className="font-medium text-ink-soft">Checked by the rules, not the AI.</span> Kept
          in your access log, not on {possessive(name)} advice record.
        </span>
      </p>
    </section>
  )
}
