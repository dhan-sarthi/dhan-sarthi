import { bank, bankSource } from '../providers/bank.js'

export default async function snapshotRoutes(app) {
  // The single customer snapshot every surface reads from.
  //
  // Borrowed from Team X's architecture, and the best idea in their codebase: if the
  // conversational layer and the screens read the same object, the advisor physically
  // cannot quote a number the UI does not show.
  app.get('/api/snapshot/:cif', async (req, reply) => {
    try {
      const b = await bank()
      const [customer, accounts, transactions, liabilities, holdings, productShelf] = await Promise.all([
        b.getCustomer(req.params.cif),
        b.getAccounts(req.params.cif),
        b.getTransactions(req.params.cif),
        b.getLiabilities(req.params.cif),
        b.getHoldings(req.params.cif),
        b.getProductShelf(),
      ])
      return { source: bankSource, customer, accounts, transactions, liabilities, holdings, productShelf }
    } catch (err) {
      req.log.error({ err: err.message }, 'snapshot failed')
      return reply.code(502).send({ error: err.message })
    }
  })
}
