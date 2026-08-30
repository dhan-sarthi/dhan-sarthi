// The bank. Fixtures today, IDBI's sandbox tomorrow, same interface either way.
//
// IDBI's catalogue (API 393 statement, 394 accounts, 362 liens, 402 loan overdues, 456
// customer master, and the OneMoney AA flow) maps onto these five calls. Everything above
// this layer is written against the shape below, so integration is a matter of filling in
// idbi.js rather than touching the advisory engine.
//
// Note: the catalogue has no API for mutual fund holdings, insurance policies, the product
// shelf, or placing an order. Those stay fixtures until the Bank confirms otherwise —
// see docs/product/, and the question raised with them by email.

const SOURCE = process.env.BANK_SOURCE || 'fixtures'

/**
 * @typedef {Object} BankAdapter
 * @property {(cif: string) => Promise<object>} getCustomer          API 456
 * @property {(cif: string) => Promise<object[]>} getAccounts        API 394
 * @property {(acctId: string, from: string, to: string) => Promise<object[]>} getTransactions  API 393
 * @property {(cif: string) => Promise<object[]>} getLiabilities     API 402 / 442
 * @property {(cif: string) => Promise<object[]>} getHoldings        no API yet — fixtures
 * @property {() => Promise<object[]>} getProductShelf               no API yet — fixtures
 */

async function fixtures() {
  const { default: data } = await import('../fixtures/rohan.js')
  return {
    async getCustomer() { return data.customer },
    async getAccounts() { return data.accounts },
    async getTransactions() { return data.transactions },
    async getLiabilities() { return data.liabilities },
    async getHoldings() { return data.holdings },
    async getProductShelf() { return data.productShelf },
  }
}

async function idbi() {
  throw new Error(
    'BANK_SOURCE=idbi is not implemented yet — sandbox credentials are pending. ' +
    'Implement against the API catalogue and keep the same interface.',
  )
}

let cached
/** @returns {Promise<BankAdapter>} */
export async function bank() {
  if (!cached) cached = SOURCE === 'idbi' ? await idbi() : await fixtures()
  return cached
}

export const bankSource = SOURCE
