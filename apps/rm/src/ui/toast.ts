import type * as SonnerModule from 'sonner'
import type { ExternalToast, toast as SonnerToast } from 'sonner'

/**
 * `toast("Call logged")`, without the toast library in the first chunk. The calls are the
 * library's own (`sonner`), made once its module has loaded; `App.tsx` mounts the `Toaster` from
 * the same module just after the first paint, so by the time an RM has done something worth
 * confirming, both are here. A toast confirms; it never carries the only copy of an error the RM
 * must act on, so a confirmation that arrives a frame late loses nothing.
 */
type Sonner = typeof SonnerModule
type Message = Parameters<typeof SonnerToast>[0]

let sonner: Promise<Sonner> | undefined

function later(show: (toast: Sonner['toast']) => unknown): void {
  sonner ??= import('sonner')
  void sonner.then((m) => show(m.toast))
}

export const toast = Object.assign(
  (message: Message, data?: ExternalToast): void => later((t) => t(message, data)),
  {
    success: (message: Message, data?: ExternalToast): void =>
      later((t) => t.success(message, data)),
    error: (message: Message, data?: ExternalToast): void => later((t) => t.error(message, data)),
    info: (message: Message, data?: ExternalToast): void => later((t) => t.info(message, data)),
  },
)
