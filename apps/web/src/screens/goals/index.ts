/**
 * The goal surface, as one import.
 *
 * `SmartJars` is the whole thing: it owns the list, the create funnel and the detail page, the
 * way `Discover` owns the transaction spine. It takes an optional `chrome`, so it drops into a
 * tab of its own (`<SmartJars view … />`) or into a pane of another screen's tab row
 * (`<SmartJars view chrome={chrome} … />`) without either caller having to know about the pages
 * behind it.
 *
 * `jars()` is exported beside it because the jar shape is the useful part for anyone else: a
 * dashboard tile wanting "2 of your 3 jars are on track" should read the same mapping this
 * screen does rather than derive a second answer from the roadmap.
 */
export { SmartJars } from './SmartJars.tsx'
export { JarCard } from './JarCard.tsx'
export { jars, nonJarStages, statusLabel, statusTone } from './jar.ts'
export type { Jar, JarStatus } from './jar.ts'
