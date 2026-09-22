// The phone a laptop's browser shows the app in.
//
// Why a desktop gets one is src/lib/phone-frame.ts. This is how: the frame holds the app itself in
// an iframe, 390 × 844 — the size every screenshot of the app is taken at (tools/shoot.mjs).
//
// A column drawn round the app in the same page would not have done it. The screens read the
// window's size, and a sheet is a Modal that portals to the page's body, so a narrow column in a
// wide window would still page the welcome carousel 1,440 pixels at a time and open every sheet
// across the whole screen. Inside the iframe the window *is* the phone, so every screen, sheet and
// toast lays itself out exactly as it does on one, and none of them had to change.
//
// What the iframe costs, and what pays for it:
//   - The bundle runs twice: once out here, to draw this frame and nothing else — no provider, no
//     API call — and once inside it. In production the second fetch is a cache hit, because the
//     bundle is hashed and served immutable (infra/scripts/deploy-web.sh).
//   - The address bar would stay on the first URL while the app moved on underneath it. So every
//     move the app makes is copied up to this page (`mirror`), and a reload, a bookmark or a shared
//     link lands on the screen being looked at. Back and Forward needed nothing: a frame's history
//     is the tab's.
//   - It is same-origin, which the CDN's security headers allow (X-Frame-Options: SAMEORIGIN), and
//     it is granted the microphone by name, because Uday's call listens.
//
// Only the tab's own window draws a frame, so the app inside one never draws a second.
import { useState, type CSSProperties } from 'react'
import { Platform } from 'react-native'
import { wantsPhoneFrame } from '~/lib/phone-frame'
import { color, space } from '@dhan/design'

/** The phone drawn: an iPhone 12 to 15, and the size the app's screenshots are taken at. */
const SCREEN = { width: 390, height: 844 }
const BEZEL = 12
/** Near an iPhone's own corner, and tight enough not to clip a header's first letter. */
const CORNER = 44
/** The least room kept round the phone. A window too short for 844 gets a shorter phone. */
const GUTTER = space.xl

export const showPhoneFrame =
  Platform.OS === 'web' &&
  typeof window !== 'undefined' &&
  window.top === window.self &&
  wantsPhoneFrame(
    { width: window.innerWidth, height: window.innerHeight },
    { width: window.screen.width, height: window.screen.height },
  )

export function PhoneFrame() {
  // The app opens wherever the page was opened; after that, `mirror` keeps the two in step.
  const [src] = useState(() => {
    const { pathname, search, hash } = window.location
    return pathname + search + hash
  })

  return (
    <div style={STAGE}>
      <div style={BODY}>
        <iframe
          src={src}
          title="Dhan Sarthi"
          allow="microphone; autoplay"
          onLoad={(e) => mirror(e.currentTarget)}
          style={GLASS}
        />
        <div style={RIM} />
      </div>
    </div>
  )
}

/**
 * Copies the app's address up to the tab's, on every push, replace and step back.
 *
 * Run on each load of the frame, since a full reload inside it brings a fresh `history` to wrap.
 * The first copy catches whatever the app did before this ran: the splash's redirect can land
 * before the frame reports that it has loaded.
 */
function mirror(frame: HTMLIFrameElement): void {
  const inner = frame.contentWindow
  if (inner === null) return

  const copy = (): void => {
    let next: string
    try {
      const at = inner.location
      if (at.origin !== window.location.origin) return
      next = at.pathname + at.search + at.hash
    } catch {
      return
    }
    const here = window.location.pathname + window.location.search + window.location.hash
    if (next !== here) window.history.replaceState(window.history.state, '', next)
  }

  for (const method of ['pushState', 'replaceState'] as const) {
    const original = inner.history[method].bind(inner.history)
    inner.history[method] = (...args: Parameters<History['pushState']>) => {
      original(...args)
      copy()
    }
  }
  inner.addEventListener('popstate', copy)
  copy()
}

const STAGE: CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: color.groundDeep,
}

const BODY: CSSProperties = {
  position: 'relative',
  padding: BEZEL,
  borderRadius: CORNER + BEZEL,
  background: color.ink,
  boxShadow: `0 32px 64px -24px ${color.scrim}`,
}

const GLASS: CSSProperties = {
  display: 'block',
  border: 0,
  width: `min(${SCREEN.width}px, calc(100vw - ${2 * (GUTTER + BEZEL)}px))`,
  height: `min(${SCREEN.height}px, calc(100dvh - ${2 * (GUTTER + BEZEL)}px))`,
  borderRadius: CORNER,
}

// Ink laid over the edge of the glass, one pixel out over the bezel and one in. Chrome leaves the
// bezel unpainted under the frame, so the anti-aliased pixels round each corner showed the page's
// light backdrop: a hairline arc wherever the screen was dark. A ring whose outer edge sat exactly
// on the glass's shared those pixels and let the arc through again; this one straddles the edge.
const RIM: CSSProperties = {
  position: 'absolute',
  inset: BEZEL - 1,
  borderRadius: CORNER + 1,
  boxShadow: `inset 0 0 0 2px ${color.ink}`,
  pointerEvents: 'none',
}
