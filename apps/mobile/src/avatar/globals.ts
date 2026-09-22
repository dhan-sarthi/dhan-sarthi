// WebRTC for the call, on the web: nothing to install, because the browser has it.
//
// A phone has no WebRTC until one is installed into the JavaScript globals, before anything
// reaches for it; `globals.native.ts` does that, and `app/_layout.tsx` imports this module first
// thing so Metro can pick the right one. Here it is empty on purpose.
export {}
