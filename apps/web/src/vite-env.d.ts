/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * 'false' removes the in-browser simulation from the build entirely (ADR-0001). Anything else,
   * including unset, keeps it as a lazy chunk for the public review URL.
   */
  readonly VITE_OFFLINE_FALLBACK?: string
  /** Where the API lives when it is not behind the same origin. Empty means same origin. */
  readonly VITE_API_BASE?: string
}
