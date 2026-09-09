/**
 * A one-line result, over the tab bar, gone in four seconds.
 *
 * Replaces the inline notices that used to sit under whichever card had just been used. Those
 * had two problems: a message under the action is below the fold as soon as the action is
 * halfway down a scroll, and a message that never leaves reads as a permanent state rather
 * than as the outcome of a tap.
 */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { AlertTriangle, Check, Info } from 'lucide-react'

export type ToastTone = 'ok' | 'bad' | 'info'

export interface ToastMessage {
  /** New id for the same text re-shows it, which a retry needs. */
  id: number
  tone: ToastTone
  text: string
}

const TONE = {
  ok: 'bg-brand text-on-dark',
  bad: 'bg-danger text-white',
  info: 'bg-tint-ink text-on-dark',
} as const

const ICON = { ok: Check, bad: AlertTriangle, info: Info } as const

export function Toast({
  message,
  onDone,
}: {
  message: ToastMessage | null
  onDone: () => void
}): ReactNode {
  const [closing, setClosing] = useState(false)

  /*
   * No reset on the way in. The shell keys this component on the message id, so a new message
   * is a new component with `closing` already false, and re-showing the same sentence after a
   * retry works without a synchronous state write here.
   */
  useEffect(() => {
    if (!message) return
    // Long enough to read a sentence, short enough not to sit over the tab bar.
    const hide = setTimeout(() => setClosing(true), 3600)
    const drop = setTimeout(onDone, 3900)
    return () => {
      clearTimeout(hide)
      clearTimeout(drop)
    }
  }, [message, onDone])

  if (!message) return null
  const Icon = ICON[message.tone]

  return (
    <div className="ds-toast" data-closing={closing ? 'true' : undefined} role="status">
      <div
        className={`flex items-center gap-2 rounded-pill px-4 py-2.5 text-[13.5px] font-semibold leading-snug shadow-lift ${TONE[message.tone]}`}
      >
        <Icon size={16} strokeWidth={2.6} className="flex-none" />
        <span className="min-w-0">{message.text}</span>
      </div>
    </div>
  )
}
