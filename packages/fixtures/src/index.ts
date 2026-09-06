/**
 * Synthetic customers and the product shelf.
 *
 * Nothing real ever lives here. The declaration signed with IDBI forbids production or
 * customer data in the sandbox, so this package is the only source of account data until
 * a verified bank adapter is connected — and it stays the source for the demo either way,
 * because a judge is going to poke at this app unsupervised.
 *
 * The contract with the rest of the system is the normalized `CustomerFile`, not a bank wire
 * response. The API boundary parses catalogue captures into that domain and keeps unsupported
 * fixture facts separate, with explicit provenance.
 */
export * from './bank-lines.ts'
export * from './calendar.ts'
export * from './calibration.ts'
export * from './generate.ts'
export * from './merchants.ts'
export * from './narration.ts'
export * from './personas.ts'
export * from './random.ts'
export * from './shelf.ts'
export * from './summary.ts'
export * from './seed-bundle.ts'
export * from './liquidity.ts'
