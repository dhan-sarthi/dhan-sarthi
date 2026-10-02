/**
 * The RM's copilot: a side sheet scoped to the open customer, with a cited meeting brief and a
 * question box. Pages render `<CopilotButton cif=… />`; the panel itself mounts once in the
 * customer layout as `<CopilotPanel cif=… />`, and Cmd/Ctrl-J opens and closes it there. A page
 * outside the file links to a brief with `<BriefMeLink cif=… />` (or `copilotHref`).
 *
 * Every sentence it shows carries footnotes to the numbered facts the server assembled, model text
 * is labelled as such, and a product named in a question is judged by the rules, never the model.
 */
import { Sparkles } from 'lucide-react'
import { Link } from 'react-router'
import { cn } from '../../lib/cn.ts'
import { Button, Tooltip, modKey } from '../../ui/index.ts'
import { PANEL_ID, copilotHref, pressCopilot, useCopilotUi, type CopilotMode } from './store.ts'

export { CopilotPanel } from './Panel.tsx'
export { copilotHref } from './store.ts'
export type { CopilotMode } from './store.ts'

export interface CopilotButtonProps {
  cif: string
  /** "Brief me" by default. */
  label?: string
  /**
   * Which mode the button opens. When not given, a label that starts "Ask" opens Ask and
   * anything else opens the brief, which is what the two buttons on the customer page say.
   */
  mode?: CopilotMode
}

/**
 * Opens the copilot on its mode, or closes it if it already shows exactly that. It reads as
 * pressed while its mode is open, so the RM can see which button the panel belongs to. The
 * Ask button sits in a card footer, so it takes the small size.
 */
export function CopilotButton({ cif, label = 'Brief me', mode }: CopilotButtonProps) {
  const ui = useCopilotUi()
  const resolved: CopilotMode = mode ?? (/^ask\b/i.test(label) ? 'ask' : 'brief')
  const open = ui.openCif === cif
  const active = open && ui.mode === resolved
  return (
    <Tooltip content={`Copilot · ${modKey()} J`}>
      <Button
        size={resolved === 'ask' ? 'sm' : 'md'}
        icon={<Sparkles aria-hidden className="text-brand" />}
        aria-expanded={open}
        aria-controls={open ? PANEL_ID : undefined}
        data-copilot-trigger=""
        onClick={() => pressCopilot(cif, resolved)}
        className={cn(active && 'border-brand/35 bg-brand-wash hover:bg-brand-wash')}
      >
        {label}
      </Button>
    </Tooltip>
  )
}

/**
 * "Brief me" from outside the file: a link that opens the customer with the brief already being
 * written. A ghost button, so it sits beside a row's primary action without competing with it.
 * Opening the file is what writes the access-log entry, exactly as Open file does.
 */
export function BriefMeLink({
  cif,
  name,
  size = 'md',
  className,
}: {
  cif: string
  /** For the accessible name: "Brief me on Karan Deshpande". */
  name?: string
  size?: 'sm' | 'md'
  className?: string
}) {
  return (
    <Button asChild variant="ghost" size={size} className={className}>
      <Link to={copilotHref(cif, 'brief')} aria-label={name ? `Brief me on ${name}` : undefined}>
        <Sparkles aria-hidden className="text-brand" />
        Brief me
      </Link>
    </Button>
  )
}
