// The Future Self avatar: a stylised, parameterised portrait.
// age: 29..60 drives greying hair + face lines.
// prosperity: 0..1 drives expression, wardrobe and the world behind them.
// In production this layer is replaced by a consented, age-progressed rendering
// of the customer's own photo (Hershfield et al., 2011 mechanism).

const lerp = (a, b, t) => a + (b - a) * t

function mixHex(c1, c2, t) {
  const p = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))
  const [r1, g1, b1] = p(c1)
  const [r2, g2, b2] = p(c2)
  const h = (x) => Math.round(x).toString(16).padStart(2, '0')
  return `#${h(lerp(r1, r2, t))}${h(lerp(g1, g2, t))}${h(lerp(b1, b2, t))}`
}

export default function FutureSelf({ age = 29, prosperity = 0.5, width = '100%', talk = 0 }) {
  const ageT = Math.min(1, Math.max(0, (age - 29) / 31)) // 0 at 29 → 1 at 60
  const p = Math.min(1, Math.max(0, prosperity))

  // world
  const sky1 = mixHex('#c8d4d2', '#ffe3b3', p)
  const sky2 = mixHex('#e6eae9', '#ffd18a', p)
  const sun = mixHex('#d8d8d2', '#ffb84d', p)
  const hill = mixHex('#b9c4bd', '#8fbf9a', p)
  const houseW = lerp(52, 96, p)
  const houseH = lerp(38, 66, p)
  const houseX = 258 - houseW / 2
  const houseColor = mixHex('#c3c2b7', '#f4efe4', p)
  const roofColor = mixHex('#a5a49a', '#d96c14', p)

  // person
  const hair = mixHex('#2e2a26', '#d8d5cf', ageT)
  const skin = '#e8b98f'
  const shirt = mixHex('#7f8c8a', '#0e6e5c', p)
  const collar = mixHex('#6e7a78', '#ffb26b', p)
  const smile = lerp(-2.5, 7, p) // control-point offset: frown → smile
  const browLift = lerp(2.5, -1.5, p)
  const lineOpacity = ageT * 0.5

  return (
    <svg viewBox="0 0 360 250" style={{ width, display: 'block' }} role="img"
      aria-label={`Your future self at age ${age}`}>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky1} />
          <stop offset="1" stopColor={sky2} />
        </linearGradient>
      </defs>

      {/* world */}
      <rect width="360" height="250" fill="url(#sky)" />
      <circle cx="308" cy="46" r={lerp(16, 24, p)} fill={sun} />
      <ellipse cx="70" cy="235" rx="180" ry="52" fill={hill} />
      <ellipse cx="330" cy="245" rx="170" ry="58" fill={mixHex('#adb8b2', '#75ad83', p)} />

      {/* house grows with prosperity */}
      <g style={{ transition: 'opacity 0.4s' }}>
        <rect x={houseX} y={196 - houseH} width={houseW} height={houseH} rx="3" fill={houseColor} />
        <polygon
          points={`${houseX - 8},${196 - houseH} ${houseX + houseW / 2},${196 - houseH - lerp(16, 30, p)} ${houseX + houseW + 8},${196 - houseH}`}
          fill={roofColor}
        />
        <rect x={houseX + houseW / 2 - 7} y={196 - houseH * 0.55} width="14" height={houseH * 0.55} rx="2" fill={mixHex('#8a897f', '#0b5c4d', p)} />
        {p > 0.45 && (
          <g opacity={Math.min(1, (p - 0.45) * 4)}>
            <rect x={houseX + 10} y={196 - houseH + 12} width="13" height="12" rx="2" fill="#ffe9c4" />
            <rect x={houseX + houseW - 23} y={196 - houseH + 12} width="13" height="12" rx="2" fill="#ffe9c4" />
          </g>
        )}
      </g>

      {/* tree appears with prosperity */}
      <g opacity={Math.min(1, p * 1.6)}>
        <rect x="36" y="176" width="7" height="22" rx="3" fill="#8a6a4a" />
        <circle cx="40" cy="166" r={lerp(10, 17, p)} fill={mixHex('#9dae9f', '#4d9d63', p)} />
      </g>

      {/* person: shoulders + head — idle life: breathing group, blinking eyes, wandering gaze */}
      <g className="fs-person">
        <path d={`M 108 250 Q 110 196 152 186 L 208 186 Q 250 196 252 250 Z`} fill={shirt} />
        {/* collar / blazer hint when prosperous */}
        <path d="M 168 188 L 180 206 L 192 188 Z" fill={collar} opacity={0.25 + p * 0.75} />

        {/* neck */}
        <rect x="167" y="158" width="26" height="34" rx="10" fill={skin} />

        {/* head */}
        <ellipse cx="180" cy="122" rx="42" ry="46" fill={skin} />

        {/* hair: side arcs recede + grey with age */}
        <path
          d={`M 138 118 Q 136 ${lerp(70, 78, ageT)} 180 ${lerp(68, 76, ageT)} Q 224 ${lerp(70, 78, ageT)} 222 118 Q 222 ${lerp(92, 100, ageT)} 180 ${lerp(88, 98, ageT)} Q 138 ${lerp(92, 100, ageT)} 138 118 Z`}
          fill={hair}
        />
        <ellipse cx="141" cy="120" rx="6" ry="13" fill={hair} />
        <ellipse cx="219" cy="120" rx="6" ry="13" fill={hair} />

        {/* brows */}
        <path d={`M 154 ${108 + browLift} Q 163 ${104 + browLift} 172 ${108 + browLift}`} stroke={hair} strokeWidth="3.5" fill="none" strokeLinecap="round" />
        <path d={`M 188 ${108 + browLift} Q 197 ${104 + browLift} 206 ${108 + browLift}`} stroke={hair} strokeWidth="3.5" fill="none" strokeLinecap="round" />

        {/* eyes */}
        <g className="fs-gaze">
          <g className="fs-eyes">
            <circle cx="163" cy="120" r="4" fill="#2b2620" />
            <circle cx="197" cy="120" r="4" fill="#2b2620" />
          </g>
        </g>

        {/* age lines */}
        <g stroke="#c08d62" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity={lineOpacity}>
          <path d="M 150 132 Q 154 135 158 133" />
          <path d="M 202 133 Q 206 135 210 132" />
          <path d="M 166 100 Q 180 96 194 100" />
        </g>

        {/* nose */}
        <path d="M 180 124 Q 176 134 181 137" stroke="#c08d62" strokeWidth="2.4" fill="none" strokeLinecap="round" />

        {/* mouth: frown ↔ smile; opens while speaking */}
        {talk > 0.04 ? (
          <ellipse cx="180" cy={149 + smile / 3} rx={7 + talk * 8} ry={2.5 + talk * 8} fill="#7c4530" />
        ) : (
          <path d={`M 164 ${148 - smile / 3} Q 180 ${148 + smile} 196 ${148 - smile / 3}`} stroke="#9c5a3c" strokeWidth="3.4" fill="none" strokeLinecap="round" />
        )}

        {/* cheerful cheeks when prosperous */}
        <g opacity={Math.max(0, p - 0.35)}>
          <ellipse cx="152" cy="137" rx="6" ry="4" fill="#e59a76" />
          <ellipse cx="208" cy="137" rx="6" ry="4" fill="#e59a76" />
        </g>
      </g>
    </svg>
  )
}
