import { useEffect, useRef, useState } from 'react'

/**
 * The avatar, in two modes.
 *
 *   hero    — large, centred, the presence moment before a conversation starts
 *   docked  — small, top right, so the screen becomes the conversation's canvas
 *
 * The two are the same element transformed, never two elements swapped. A snap between a
 * full-screen face and a corner thumbnail reads as two different apps; the head has to
 * physically travel there.
 *
 * Transform rather than width/height so the animation stays on the compositor. HERO_W and
 * HERO_H are the real pixel box; docking is a scale plus a translate from that box.
 *
 * The placeholder below occupies exactly the slot a <video> will take. Swapping in a live
 * stream is a matter of replacing <Placeholder/> with the element and keeping the same box.
 */

const HERO_W = 300
const HERO_H = 380
const DOCK_W = 132

function Placeholder({ speaking }) {
  // The Character's own reference portrait, proxied through our server because Runway's URL
  // carries a short-lived token. Using the real face here means the idle frame and the live
  // video are the same person — the swap to WebRTC is a change of medium, not of identity.
  const [failed, setFailed] = useState(false)

  if (failed) {
    // Only if the portrait cannot be fetched. Deliberately abstract: a wrong face reads worse
    // than an obvious placeholder.
    return (
      <svg viewBox="0 0 300 380" width="100%" height="100%" aria-hidden="true">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#17402C" />
            <stop offset="1" stopColor="#0C2A1C" />
          </linearGradient>
        </defs>
        <rect width="300" height="380" rx="26" fill="url(#bg)" />
      </svg>
    )
  }

  return (
    <>
      <img
        src="/api/avatar/portrait"
        alt=""
        className="avatar-portrait"
        onError={() => setFailed(true)}
      />
      {speaking && <span className="avatar-ring" aria-hidden="true" />}
    </>
  )
}

export default function AvatarStage({
  mode = 'hero', speaking = false, onTap, live = false, children,
}) {
  const docked = mode === 'docked'
  const [box, setBox] = useState({ w: 392, h: 700 })
  const wrapRef = useRef(null)

  // The dock target depends on the frame, so measure rather than hardcode.
  useEffect(() => {
    const el = wrapRef.current?.parentElement
    if (!el) return
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const scale = docked ? DOCK_W / HERO_W : 1
  // Hero sits centred and a little high; docked pins to the top-right inset.
  const heroX = (box.w - HERO_W) / 2
  const heroY = 8
  const dockX = box.w - DOCK_W - 14
  const dockY = 40   // clears the notch the phone frame draws over the screen
  const x = docked ? dockX : heroX
  const y = docked ? dockY : heroY

  return (
    <div
      ref={wrapRef}
      className={`avatar-stage${docked ? ' is-docked' : ''}`}
      style={{
        width: HERO_W, height: HERO_H,
        transform: `translate3d(${x}px, ${y}px, 0) scale(${scale})`,
        transformOrigin: 'top left',
      }}
      onClick={onTap}
      role={onTap ? 'button' : undefined}
      tabIndex={onTap ? 0 : undefined}
      onKeyDown={(e) => { if (onTap && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onTap() } }}
      aria-label={docked ? 'Expand your adviser' : 'Your adviser'}
    >
      <div className="avatar-media">
        {/* No extra crop when docked. The source is already framed head-and-shoulders and the
            portrait box crops it hard through object-fit, so zooming again on top of the dock
            scale only pushed his face out of the frame. */}
        <div className="avatar-crop">
          {live ? children : <Placeholder speaking={speaking} />}
        </div>
      </div>
    </div>
  )
}
