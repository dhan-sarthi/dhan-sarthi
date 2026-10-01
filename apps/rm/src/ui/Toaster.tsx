import { Toaster as Sonner } from 'sonner'

/**
 * Confirmations after an action ("Call logged", "Chain verified"): dark ink, bottom right, gone
 * in a few seconds. A toast confirms; it never carries the only copy of an error the RM must act
 * on — that stays on the page.
 */
export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      gap={8}
      offset={20}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'flex w-89 items-start gap-3 rounded-lg bg-chart-tooltip px-4 py-3 text-label text-chart-tooltip-text shadow-overlay',
          title: 'text-label text-chart-tooltip-text',
          description: 'mt-0.5 text-caption font-normal text-chart-tooltip-muted',
          icon: 'mt-0.5 shrink-0 [&_svg]:size-4',
          actionButton:
            'ml-auto shrink-0 rounded-sm bg-on-ink px-2 py-1 text-caption text-ink hover:bg-surface',
          cancelButton: 'shrink-0 rounded-sm px-2 py-1 text-caption text-chart-tooltip-muted',
          error: '[&_[data-icon]]:text-danger-soft',
          success: '[&_[data-icon]]:text-success',
        },
      }}
    />
  )
}

export { toast } from 'sonner'
