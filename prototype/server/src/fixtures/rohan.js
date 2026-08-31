// Demo customer, shaped like the responses IDBI's APIs return rather than like our UI.
// Keeping the fixture in the bank's shape means the adapter swap is real work done once,
// not a translation layer we discover we need later.

const txn = (date, amount, type, narration, category, extra = {}) => ({
  txnId: `TXN${date.replace(/-/g, '')}${Math.abs(amount)}`,
  txnDate: date, txnAmount: Math.abs(amount), txnType: type,
  txnMode: extra.mode || 'UPI', narration, spendCategory: category,
  balanceAfterTxn: extra.balance ?? null, isSalaryCredit: extra.salary ?? false,
  isRecurring: extra.recurring ?? false,
})

export default {
  customer: {
    cif: 'IDBI0009182731', custId: 'demo-rohan', custName: 'Rohan Mehta',
    dateOfBirth: '1997-03-14', gender: 'Male', maritalStatus: 'Married',
    dependents: 2, employmentType: 'Salaried', declaredAnnualIncome: 1020000,
    city: 'Indore', stateCode: '23', preferredLanguage: 'en-IN',
    riskProfile: 'Balanced', kycStatus: 'Verified', customerSince: '2016-11-08',
  },

  accounts: [
    { accountNumberMasked: 'XXXXXX7412', accountType: 'Savings', currentBalance: 150000,
      avgMonthlyBalance3m: 138400, avgMonthlyBalance12m: 121000, minBalance12m: 18400,
      accountOpeningDate: '2016-11-08' },
    { accountNumberMasked: 'XXXXXX9930', accountType: 'FD', currentBalance: 200000,
      maturityDate: '2026-09-11', interestRate: 7.1 },
  ],

  // One representative month. The behaviour engine derives everything else from these.
  transactions: [
    txn('2026-08-01', 85000, 'CREDIT', 'SALARY/ACME TECHNOLOGIES', 'Income', { mode: 'NEFT', salary: true, balance: 198400 }),
    txn('2026-08-02', 24500, 'DEBIT', 'RENT/LANDLORD', 'Rent & bills', { mode: 'IMPS', balance: 173900 }),
    txn('2026-08-03', 1180, 'DEBIT', 'UPI/SWIGGY/8841', 'Food & dining', { balance: 172720 }),
    txn('2026-08-05', 5000, 'DEBIT', 'SIP/AXIS MF/FLEXICAP', 'Investment', { mode: 'SI', recurring: true, balance: 167720 }),
    txn('2026-08-06', 649, 'DEBIT', 'UPI/NETFLIX', 'Entertainment', { recurring: true, balance: 167071 }),
    txn('2026-08-08', 3200, 'DEBIT', 'UPI/BIGBASKET', 'Food & dining', { balance: 163871 }),
    txn('2026-08-11', 2450, 'DEBIT', 'UPI/SWIGGY/4471', 'Food & dining', { balance: 161421 }),
    txn('2026-08-14', 7400, 'DEBIT', 'CARD/MYNTRA', 'Shopping', { mode: 'CARD', balance: 154021 }),
    txn('2026-08-18', 4300, 'DEBIT', 'UPI/UBER', 'Transport', { balance: 149721 }),
    txn('2026-08-22', 2951, 'DEBIT', 'UPI/BOOKMYSHOW', 'Entertainment', { balance: 146770 }),
  ],

  liabilities: [
    { loanType: 'Education Loan', outstandingPrincipal: 340000, emiAmount: 8200,
      loanInterestRate: 9.15, tenureRemainingMonths: 46, dpdStatus: 0 },
  ],

  // No IDBI API for these yet — flagged with the Bank.
  holdings: [
    { holdingType: 'MUTUAL_FUND', name: 'Axis Flexi Cap Fund', assetClass: 'Equity',
      investedAmount: 145000, currentValue: 178400, sipActive: true, sipAmount: 5000, sipDebitDay: 5 },
    { holdingType: 'FD', name: 'IDBI Fixed Deposit', assetClass: 'Debt',
      investedAmount: 200000, currentValue: 200000, sipActive: false, maturityDate: '2026-09-11', interestRate: 7.1 },
  ],

  // Fields here are what the suitability gate reads: riskometer band, lock-in, whether the
  // product bundles protection with investment, and the monthly ticket.
  productShelf: [
    { productId: 'IDBI_MF_00184', name: 'Nifty 50 Index Fund', category: 'Index Fund',
      riskometer: 'Very High', minInvestment: 500, expenseRatio: 0.20, planType: 'Direct',
      lockInYears: 0, transactable: true },
    { productId: 'IDBI_MF_00231', name: 'Short Duration Debt Fund', category: 'Debt',
      riskometer: 'Moderate', minInvestment: 1000, expenseRatio: 0.35, planType: 'Direct',
      lockInYears: 0, transactable: true },
    { productId: 'IDBI_MF_00412', name: 'Liquid Fund', category: 'Liquid',
      riskometer: 'Low to Moderate', minInvestment: 500, expenseRatio: 0.15, planType: 'Direct',
      lockInYears: 0, transactable: true },
    { productId: 'IDBI_ELSS_0077', name: 'ELSS Tax Saver Fund', category: 'ELSS',
      riskometer: 'Very High', minInvestment: 500, expenseRatio: 0.85, planType: 'Direct',
      lockInYears: 3, transactable: true },
    { productId: 'LIC_TERM_0021', name: 'LIC Term Assurance, 1 Cr cover', category: 'Term Insurance',
      riskometer: 'Low', minInvestment: 850, insuranceProduct: true,
      lockInYears: 0, transactable: true },
    // On the shelf precisely so the advisor can refuse it. A product list containing only
    // suitable products cannot demonstrate suitability.
    { productId: 'LIC_ULIP_0088', name: 'LIC Market Plus ULIP', category: 'ULIP',
      riskometer: 'High', minInvestment: 2500, expenseRatio: 2.25, insuranceProduct: true,
      lockInYears: 5, bundlesProtectionAndInvestment: true, transactable: true,
      note: 'Bundled cover and investment. Five-year lock-in.' },
  ],
}
