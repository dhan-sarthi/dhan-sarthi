/**
 * The avatar slot.
 *
 * Deliberately a defined box rather than a drawing. Whatever eventually goes here — an
 * illustrated face, a generated one, a video head — drops in without the layout shifting.
 * Until then it shows an initial and a ring that responds to the advisor's own audio level,
 * so the head reads as speaking before it has a mouth.
 */
export default function Avatar({ level = 0, size = 'md', speaking = false }) {
  const scale = 1 + Math.min(1, level) * 0.10
  return (
    <div className={`avatar-slot${size === 'lg' ? ' lg' : ''}`} aria-hidden="true">
      <span
        className="ring"
        style={{ transform: `scale(${scale})`, opacity: speaking ? 0.25 + Math.min(1, level) * 0.6 : 0 }}
      />
      <span className="initial">DS</span>
    </div>
  )
}
