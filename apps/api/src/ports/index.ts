/**
 * The sixteen ports. Interfaces only: no port file has a runtime import and none names an
 * adapter — `ports-are-interfaces-only` in .dependency-cruiser.cjs and the third case in
 * apps/api/test/architecture/depcruise.test.ts both fail if one does. An adapter implements
 * exactly one of them, and `composition/` is where they are chosen: root.ts assembles, and
 * profiles.ts holds the per-source and per-provider tables that say which class each port
 * gets. Wiring a new adapter means editing one of those two and nothing above them. The one
 * place outside composition/ that names an adapter class is cli/audit-verify.ts, a standalone
 * script with no Deps of its own.
 *
 * This list is not hand-maintained: `the ports barrel` in
 * apps/api/test/architecture/ports-barrel.test.ts fails if a `*.port.ts` file is missing from
 * it, or if the count in the sentence above is wrong. It said "ten" while exporting fifteen
 * for long enough that two ports went unexported and an importer of one of them only
 * typechecked by luck.
 *
 * The rule for adding one: a port is earned by a second implementation, either present or named
 * with the place it will live. The two that have a single adapter today — declared-profile and
 * aa-consent — each say in their own doc comment which second one is expected and why it cannot
 * be collapsed into the one that exists: application/ and http/ may not import adapters/, and no
 * adapter may import another, so for those callers the interface is the only thing they are
 * allowed to depend on. An interface with no adapter at all is not a seam; it is an intention,
 * and an intention belongs in an ADR until its first adapter arrives (ADR-0008).
 */
export type * from './bank-data.port.ts'
export type * from './declared-profile.port.ts'
export type * from './holdings.port.ts'
export type * from './aa-consent.port.ts'
export type * from './aa-gateway.port.ts'
export type * from './lead-sink.port.ts'
export type * from './product-shelf.port.ts'
export type * from './session-store.port.ts'
export type * from './snapshot-store.port.ts'
export type * from './audit-store.port.ts'
export type * from './lease-store.port.ts'
export type * from './avatar-provider.port.ts'
export type * from './avatar-rpc-host.port.ts'
export type * from './avatar-tool-webhook.port.ts'
export type * from './clock.port.ts'
export type * from './language-model.port.ts'
