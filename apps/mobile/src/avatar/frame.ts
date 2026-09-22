// Where the call's picture sits on the stage.
//
// Runway sends 1088×704, landscape, and offers no portrait size (its docs recommend 1088×704 for
// the reference image, and the stream follows it). On a phone held upright that is the whole
// problem: filling the screen shows a third of the frame's width — a face and nothing else, the
// ears and hair cut off, which is what the owner first called "too zoomed in" — and showing half
// of it (the second try, 22 September 2026) left a third of the screen as a gradient he did not
// want either. A video call should be the person, edge to edge.
//
// So: 36% of the width, from the top of the screen down. His whole head and his shoulders, the
// picture filling about nine-tenths of the stage, and the last strip — where the one button of a
// call sits anyway — fading into the ink. Compared on the real frame against 33% (full screen)
// and 40% (82% of the screen, the empty strip back).
/** How much of a landscape frame's width the stage shows. */
export const WIDTH_SHOWN = 0.36
/** How far down the stage the picture starts, as a share of its height. From the very top now. */
export const TOP_SHARE = 0

export type Frame = { top: number; height: number; fills: boolean }

/**
 * A band as wide as the stage and as tall as the crop needs — or the whole stage, when the crop
 * would need more than that. A portrait track (Anam's 768×1152) always fills, and so does a
 * landscape one on a screen wider than it is tall; only a landscape call on a phone gets the band.
 */
export function frameFor(stageW: number, stageH: number, aspect: number): Frame {
  const tall = stageW / (WIDTH_SHOWN * aspect)
  if (!(tall < stageH * (1 - TOP_SHARE))) return { top: 0, height: stageH, fills: true }
  return { top: Math.round(stageH * TOP_SHARE), height: Math.round(tall), fills: false }
}
