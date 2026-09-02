/**
 * What IDBI can actually put this customer into.
 *
 * Sourced from IDBI's own site and public filings — see `docs/product/08-product-shelf.md`
 * for the citations and for what each product is. Two facts shape this list:
 *
 * 1. **IDBI distributes funds and insurance; it does not manufacture them.** It is an
 *    AMFI-registered distributor and LIC's largest bancassurance partner, with LIC as its
 *    majority shareholder. So `manufacturer` is a real field, invented scheme names are not
 *    acceptable, and the conflict of interest in refusing a LIC product is genuine — which
 *    is the only reason refusing one means anything.
 * 2. **A shelf of suitable products cannot demonstrate suitability.** The ULIP and the
 *    endowment plan are here precisely so the gate can refuse them.
 *
 * Rates and premiums marked [verify] must be re-checked before this goes in front of a
 * banker. They will know.
 */
import type { Product } from '@dhan/core'

export const PRODUCT_SHELF: readonly Product[] = [
  /* IDBI's own balance-sheet products ------------------------------------ */
  {
    productId: 'IDBI_SWEEP_001',
    name: 'IDBI Sweep-in Fixed Deposit',
    category: 'Sweep-in FD',
    riskometer: 'Low',
    minInvestment: 10_000,
    lockInYears: 0,
    transactable: true,
    manufacturer: 'IDBI Bank',
    indicativeReturn: 6.8,
    // The answer to idle cash that needs no risk appetite, no lock-in and no new KYC.
    // Balance above a threshold moves to a deposit and comes back the moment it is needed.
    note: 'Auto-sweeps balance above a threshold into a deposit; breaks back on demand. [verify IDBI brand name]',
  },
  {
    productId: 'IDBI_SSP_002',
    name: 'IDBI Systematic Savings Plan (SSP)',
    category: 'Recurring Deposit',
    riskometer: 'Low',
    minInvestment: 500,
    lockInYears: 0,
    transactable: true,
    manufacturer: 'IDBI Bank',
    indicativeReturn: 6.9,
    // The bank's own SIP. For a Conservative customer this is the correct first product,
    // and unlike a mutual fund it stays on IDBI's balance sheet.
    note: 'Fixed monthly contribution, deposit rates, no market risk. [verify rate]',
  },
  {
    productId: 'IDBI_SUVIDHA_003',
    name: 'IDBI Suvidha Fixed Deposit',
    category: 'Fixed Deposit',
    riskometer: 'Low',
    minInvestment: 10_000,
    lockInYears: 0,
    transactable: true,
    manufacturer: 'IDBI Bank',
    indicativeReturn: 7.1,
  },

  /* Distributed — mutual funds ------------------------------------------- */
  {
    productId: 'MF_LIQUID_101',
    name: 'LIC MF Liquid Fund',
    category: 'Liquid',
    riskometer: 'Low to Moderate',
    minInvestment: 500,
    lockInYears: 0,
    transactable: true,
    manufacturer: 'LIC Mutual Fund',
    expenseRatio: 0.16,
    note: 'Redeems in about a day. The right home for an emergency buffer.',
  },
  {
    productId: 'MF_DEBT_102',
    name: 'LIC MF Short Duration Fund',
    category: 'Debt',
    riskometer: 'Moderate',
    minInvestment: 1_000,
    lockInYears: 0,
    transactable: true,
    manufacturer: 'LIC Mutual Fund',
    expenseRatio: 0.38,
    note: 'Goals one to three years out. Never equity below three years.',
  },
  {
    productId: 'MF_INDEX_103',
    name: 'UTI Nifty 50 Index Fund',
    category: 'Index Fund',
    riskometer: 'Very High',
    minInvestment: 500,
    lockInYears: 0,
    transactable: true,
    manufacturer: 'UTI Mutual Fund',
    expenseRatio: 0.2,
    note: 'The cheapest way to own equity. Long horizons only.',
  },
  {
    productId: 'MF_ELSS_104',
    name: 'LIC MF ELSS Tax Saver',
    category: 'ELSS',
    riskometer: 'Very High',
    minInvestment: 500,
    lockInYears: 3,
    transactable: true,
    manufacturer: 'LIC Mutual Fund',
    expenseRatio: 0.87,
    // The new tax regime has been the default since FY 2023-24, so for most customers 80C is
    // worth nothing and this is an equity fund carrying a lock-in for no benefit. Suitability
    // has to read the customer's regime before this is ever suggested.
    note: 'Only on the old tax regime. Otherwise an equity fund with a pointless lock-in.',
  },

  /* Distributed — protection --------------------------------------------- */
  {
    productId: 'LIC_TERM_201',
    name: 'LIC Term Assurance — ₹1 crore cover',
    category: 'Term Insurance',
    riskometer: 'Low',
    minInvestment: 880,
    lockInYears: 0,
    transactable: true,
    manufacturer: 'LIC of India',
    insuranceProduct: true,
    coverType: 'life',
    coverAmount: 10_000_000,
    note: 'Pure cover, no maturity value. [verify premium against a real quote at age 29]',
  },
  {
    productId: 'NIVA_HEALTH_202',
    name: 'Niva Bupa ReAssure — ₹10 lakh family floater',
    category: 'Health Insurance',
    riskometer: 'Low',
    minInvestment: 1_450,
    lockInYears: 0,
    transactable: true,
    manufacturer: 'Niva Bupa',
    insuranceProduct: true,
    coverType: 'health',
    coverAmount: 1_000_000,
    note: 'One admission undoes a decade of SIP. [verify premium]',
  },
  {
    productId: 'GOI_PMJJBY_203',
    name: 'PMJJBY — ₹2 lakh life cover',
    category: 'Government Insurance',
    riskometer: 'Low',
    minInvestment: 37,
    lockInYears: 0,
    transactable: true,
    manufacturer: 'Government of India',
    insuranceProduct: true,
    coverType: 'life',
    coverAmount: 200_000,
    // Pays the bank almost nothing, which is exactly why recommending it is unimpeachable.
    note: '~₹436 a year. For a customer who cannot afford term cover. [verify current rate]',
  },
  {
    productId: 'GOI_PMSBY_204',
    name: 'PMSBY — ₹2 lakh accident cover',
    category: 'Government Insurance',
    riskometer: 'Low',
    minInvestment: 2,
    lockInYears: 0,
    transactable: true,
    manufacturer: 'Government of India',
    insuranceProduct: true,
    coverType: 'accident',
    coverAmount: 200_000,
    note: '~₹20 a year. [verify current rate]',
  },

  /* Distributed — long-horizon government schemes ------------------------- */
  {
    productId: 'PFRDA_NPS_301',
    name: 'National Pension System — Tier I',
    category: 'NPS',
    riskometer: 'Moderately High',
    minInvestment: 500,
    lockInYears: 31,
    transactable: true,
    manufacturer: 'PFRDA',
    note: 'Retirement specifically. Locked to 60, extra ₹50k deduction under 80CCD(1B).',
  },
  {
    productId: 'GOI_PPF_302',
    name: 'Public Provident Fund',
    category: 'PPF',
    riskometer: 'Low',
    minInvestment: 500,
    lockInYears: 15,
    transactable: true,
    manufacturer: 'Government of India',
    indicativeReturn: 7.1,
    note: 'Tax-free, sovereign guarantee, ₹1.5L a year cap. IDBI accepts at ~675 branches.',
  },

  /* On the shelf so the gate can refuse them ------------------------------ */
  {
    productId: 'LIC_ULIP_401',
    name: 'LIC Market Plus ULIP',
    category: 'ULIP',
    riskometer: 'High',
    minInvestment: 2_500,
    lockInYears: 5,
    transactable: true,
    manufacturer: 'LIC of India',
    expenseRatio: 2.25,
    insuranceProduct: true,
    coverType: 'life',
    bundlesProtectionAndInvestment: true,
    coverAmount: 300_000,
    // Expensive cover and mediocre investing in one wrapper, and it pays the distributor far
    // more than term-plus-fund does. Refusing it is the only thing in this app that costs
    // the bank money in the short run, which is why it is the only thing that proves us.
    note: 'Bundled cover and investment. Five-year lock-in, charges buried inside.',
  },
  {
    productId: 'LIC_ENDOW_402',
    name: 'LIC Jeevan Anand Endowment',
    category: 'Endowment',
    riskometer: 'Low',
    minInvestment: 4_200,
    lockInYears: 15,
    transactable: true,
    manufacturer: 'LIC of India',
    insuranceProduct: true,
    coverType: 'life',
    bundlesProtectionAndInvestment: true,
    coverAmount: 500_000,
    note: 'Savings-plus-insurance. Effective return typically 4-5%. Same refusal as the ULIP.',
  },
]

export function productById(id: string): Product {
  const found = PRODUCT_SHELF.find((p) => p.productId === id)
  if (!found) throw new Error(`no product ${id} on the shelf`)
  return found
}
