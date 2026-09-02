/**
 * Synthetic customers and the product shelf.
 *
 * Nothing real ever lives here. The declaration signed with IDBI forbids production or
 * customer data in the sandbox, so this package is the only source of account data until
 * BANK_SOURCE=idbi points at their APIs — and it stays the source for the demo either way,
 * because a judge is going to poke at this app unsupervised.
 *
 * The contract with the rest of the system is `CustomerFile`, which is shaped like IDBI's
 * API responses rather than like our screens. Swapping in the real feed is a new adapter and
 * nothing above it moves.
 */
export * from './calendar.ts'
export * from './generate.ts'
export * from './merchants.ts'
export * from './personas.ts'
export * from './random.ts'
export * from './shelf.ts'
export * from './summary.ts'
