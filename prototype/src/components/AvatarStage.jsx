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
const DOCK_W = 92

function Placeholder({ level, speaking }) {
  // Portrait-proportioned and deliberately abstract. Its job is to be the right shape and
  // the right size, so we can judge whether the artifact area survives — not to look human.
  const open = 6 + Math.min(1, level) * 16
  return (
    <svg viewBox="0 0 300 380" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#17402C" />
          <stop offset="1" stopColor="#0C2A1C" />
        </linearGradient>
        <clipPath id="frame"><rect width="300" height="380" rx="26" /></clipPath>
      </defs>
      <g clipPath="url(#frame)">
        <rect width="300" height="380" fill="url(#bg)" />
        {/* shoulders */}
        <path d="M40 380c0-58 48-96 110-96s110 38 110 96Z" fill="#1E6B4A" />
        {/* neck, head, hair */}
        <rect x="132" y="228" width="36" height="42" rx="16" fill="#C79A72" />
        <ellipse cx="150" cy="188" rx="62" ry="72" fill="#D8AC84" />
        <path d="M88 176c0-44 28-70 62-70s62 26 62 70c0 12-6 8-10-4-8-24-26-36-52-36s-44 12-52 36c-4 12-10 16-10 4Z" fill="#2B1B12" />
        {/* eyes */}
        <ellipse cx="128" cy="182" rx="6" ry="7" fill="#22160F" />
        <ellipse cx="172" cy="182" rx="6" ry="7" fill="#22160F" />
        {/* mouth, driven by the same audio level that will drive real lip-sync */}
        <ellipse cx="150" cy="222" rx="15" ry={open / 2} fill="#7C3B33" />
        {speaking && <circle cx="150" cy="188" r="86" fill="none" stroke="#1EC677" strokeWidth="2" opacity=".35" />}
      </g>
    </svg>
  )
}

export default function AvatarStage({
  mode = 'hero', level = 0, speaking = false, onTap,
  videoRef, audioRef, live = false,
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
        {/* Docked, the frame tightens to the head. A full portrait at 92px reads as a smudge,
            and a real video stream will need the same crop change. */}
        <div className="avatar-crop" style={docked ? { transform: 'scale(1.75) translateY(-14%)' } : undefined}>
          {/* The video and audio elements always exist so the avatar client has something to
              attach to; they are simply invisible until a stream is actually running. The
              placeholder is not a stand-in for a missing feature — it is the fallback that
              keeps the demo alive when the service is unavailable. */}
          <video
            ref={videoRef} className="avatar-video" playsInline autoPlay muted={false}
            style={{ opacity: live ? 1 : 0 }}
          />
          <audio ref={audioRef} autoPlay />
          {!live && <Placeholder level={level} speaking={speaking} />}
        </div>
      </div>
    </div>
  )
}
