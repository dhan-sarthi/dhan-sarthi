/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Where the API lives when it is not behind the same origin. Empty means same origin. */
  readonly VITE_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** The short commit the bundle was built from, or "dev". Set by `define` in vite.config.ts. */
declare const __BUILD_SHA__: string
