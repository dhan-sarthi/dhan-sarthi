/**
 * The category taxonomy the Discover grid is drawn from: one icon and one short label per kind
 * of thing IDBI's shelf carries.
 *
 * It sits beside `CategoryGrid` rather than inside it because the label is needed twice — once on
 * the tile and once by whatever names the filter the tile set — and a component file that also
 * exports a lookup gives up fast refresh for everything that imports it.
 */

/** Category as the shelf spells it, to the icon drawn for it in `public/icons`. */
export const CATEGORY_ICON: Record<string, string> = {
  'Sweep-in FD': 'sweep-in-fd',
  'Fixed Deposit': 'fixed-deposit',
  'Recurring Deposit': 'recurring-deposit',
  Liquid: 'liquid-fund',
  Debt: 'debt-fund',
  'Index Fund': 'index-fund',
  ELSS: 'elss',
  'Term Insurance': 'term-insurance',
  'Health Insurance': 'health-insurance',
  'Government Insurance': 'govt-insurance',
  NPS: 'nps',
  PPF: 'ppf',
  ULIP: 'ulip',
  Endowment: 'endowment',
}

/** Shorter than the shelf's own wording, because a tile label is two lines at most. */
const LABEL: Record<string, string> = {
  'Sweep-in FD': 'Sweep-in FD',
  'Fixed Deposit': 'Fixed deposits',
  'Recurring Deposit': 'Recurring',
  Liquid: 'Liquid funds',
  Debt: 'Debt funds',
  'Index Fund': 'Index funds',
  ELSS: 'Tax saver',
  'Term Insurance': 'Term cover',
  'Health Insurance': 'Health cover',
  'Government Insurance': 'Govt. cover',
  NPS: 'NPS',
  PPF: 'PPF',
  ULIP: 'ULIP',
  Endowment: 'Endowment',
}

/** The tile wording for a category, for anything that has to name the current filter. */
export function categoryLabel(category: string): string {
  return LABEL[category] ?? category
}
