// When a browser shows the app inside a phone instead of across the whole window.
//
// The app is built for a phone and nothing else. Its screens are laid out for 360 to 440 points
// of width, and about twenty of them size themselves off the window — the welcome carousel pages
// by its width, a sheet stops at 88% of its height — so on a laptop the same code stretches across
// 1,440 pixels and looks broken. A browser window wider than a phone shows the app in a
// phone-sized frame instead (src/ui/PhoneFrame.tsx). A tablet is framed too: app.json says
// `supportsTablet: false`, so on an iPad iOS itself runs the app in an iPhone-sized window, and
// the browser now does the same.
//
// Two windows are wider than a phone and are still on one: a phone turned on its side, and a
// phone asking for the desktop site, which lays the page out 980 pixels wide. Both keep the whole
// window. The screen gives them away — it is phone-sized however the page is laid out — so the
// screen says what kind of device this is, and the window only says whether the app would be
// stretched.

export type Size = { width: number; height: number }

/** Comfortably wider than the widest phone held upright, which is 440 points. */
export const PHONE_WIDEST = 500

export function wantsPhoneFrame(window: Size, screen: Size): boolean {
  const onPhone = Math.min(screen.width, screen.height) <= PHONE_WIDEST
  return !onPhone && window.width > PHONE_WIDEST
}
