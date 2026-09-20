/**
 * Image imports, for the type checker.
 *
 * Metro turns `import x from './a.png'` into an opaque numeric asset handle; TypeScript has
 * no idea that is a thing. `@dhan/assets` ships its own copy of these declarations, but that
 * file is outside this app's `include`, so they are repeated here — they are program-wide, and
 * they are what lets the assets package's own imports resolve from here.
 */
declare module '*.png' {
  const src: string | number
  export default src
}

declare module '*.jpg' {
  const src: string | number
  export default src
}
