/**
 * An image import, whatever the bundler makes of it.
 *
 * Vite hands back a URL string; Metro hands back an opaque numeric asset reference. Neither is
 * wrong and the two are not interchangeable, so the type is the union and the caller passes it
 * straight to the `Image` its own platform provides. Nothing in this package inspects the value.
 */
declare module '*.png' {
  const src: string | number
  export default src
}

declare module '*.jpg' {
  const src: string | number
  export default src
}
