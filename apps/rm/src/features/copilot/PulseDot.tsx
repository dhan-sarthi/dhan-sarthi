/**
 * The copilot's "working" mark: a small green dot that breathes while a model call is out. It
 * always sits beside words that say what is happening; on its own it would be a spinner.
 */
export function PulseDot() {
  return (
    <span aria-hidden className="relative inline-flex size-2">
      <span className="absolute inset-0 animate-ping rounded-full bg-brand/40" />
      <span className="relative inline-flex size-2 rounded-full bg-brand" />
    </span>
  )
}
