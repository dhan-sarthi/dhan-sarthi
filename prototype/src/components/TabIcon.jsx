/**
 * Tab icons as inline SVG.
 *
 * Unicode glyphs were being used here and two of the four silently failed to render,
 * leaving those tabs with a label and no icon and the row visibly out of alignment.
 * Drawing them removes the dependency on whatever fonts the device happens to have.
 */
const paths = {
  chat: 'M12 3c5 0 9 3.36 9 7.5S17 18 12 18a10.7 10.7 0 0 1-2.6-.32L5 20l.9-3.6A7.9 7.9 0 0 1 3 10.5C3 6.36 7 3 12 3Z',
  money: 'M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Zm8 3.5A2.5 2.5 0 1 0 12 14.5 2.5 2.5 0 0 0 12 9.5Z',
  future: 'M12 3a9 9 0 1 1-9 9h2a7 7 0 1 0 7-7v3l-4-4 4-4v3Zm.75 5v4.3l3.1 1.84-.75 1.26-3.85-2.3V8Z',
  record: 'M6 3h9l4 4v14H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm8 1.5V8h3.5L14 4.5ZM8 11h8v1.5H8V11Zm0 3.5h8V16H8v-1.5Z',
}

export default function TabIcon({ name }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={paths[name] || paths.chat} />
    </svg>
  )
}
