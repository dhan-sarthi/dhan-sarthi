// What a challenge's target, or a merchant, is called inside the app's own sentences.
//
// Core names a merchant it recognises and a category it assigns, and both are written as labels:
// "Fast food", "Coffee shop", "Food & dining" — a capital, and the singular a list row wants.
// Dropped into a sentence as they come they read like a form filled in: "Spend less on Coffee
// shop", "Fast food Challenge". So a sentence asks this file for the name.
//
// A kind of place or spend reads in lower case, and in the plural where that is how people say it
// ("coffee shops", "fast food", "food & dining"). A brand keeps its name exactly as the brand
// writes it: Swiggy, DMart, Reliance Retail. A name this file doesn't know is treated as a brand,
// because an unknown merchant is far likelier to be a shop's own name than a new kind of place,
// and a brand in lower case ("swiggy") is the worse of the two mistakes.
//
// The kinds are core's: the rules in `packages/core/src/merchants.ts` whose `merchant` is a kind
// of place rather than a name — "Fast food" is Domino's, KFC and Pizza Hut together. Core doesn't
// export that table (`categorize()` is its one reader), so the names are repeated here, and a kind
// added there reads as a brand here until it is added: a capital mid-sentence, not a crash. The
// categories are a total `Record` over `SpendCategory`, so a new one fails to compile instead.
//
// A title that starts with the name keeps the name as written and puts the rest in sentence case:
// "Fast food challenge", "Swiggy challenge".
import type { SpendCategory } from '@dhan/contracts'

/** Core's kinds of place or spend, each as it reads after "Spend less on". */
const KINDS: ReadonlyMap<string, string> = new Map([
  ['Supermarket', 'supermarkets'],
  ['Local kirana', 'local kiranas'],
  ['Meat delivery', 'meat delivery'],
  ['Fast food', 'fast food'],
  ['Coffee shop', 'coffee shops'],
  ['Tapri', 'tapris'],
  ['Restaurant', 'restaurants'],
  ['Fuel', 'fuel'],
  ['Public transport', 'public transport'],
  ['Electronics', 'electronics'],
  ['Retail', 'retail'],
  ['Shopping mall', 'shopping malls'],
  ['Software', 'software'],
  ['Travel', 'travel'],
  ['Streaming', 'streaming'],
  ['Books', 'books'],
  ['Cinema', 'cinema'],
  ['Games', 'games'],
  ['Pharmacy', 'pharmacies'],
  ['Healthcare', 'healthcare'],
  ['Broadband', 'broadband'],
  ['Electricity', 'electricity'],
  ['Gas', 'gas'],
  ['Education', 'education'],
  ['Lender', 'lenders'],
  ['Mutual fund', 'mutual funds'],
  ['Small savings', 'small savings'],
  ['Insurance', 'insurance'],
  // Adjectives on their own ("spend less on rail & bus"), so these three take a noun.
  ['Rail & bus', 'rail & bus tickets'],
  ['Mobile', 'mobile bills'],
  ['Civic', 'civic bills'],
])

/** A category target is named by its category. Initials stay capitals: "loan EMIs". */
const CATEGORY: Readonly<Record<SpendCategory, string>> = {
  Income: 'income',
  'Rent & bills': 'rent & bills',
  Groceries: 'groceries',
  'Food & dining': 'food & dining',
  Transport: 'transport',
  Shopping: 'shopping',
  Entertainment: 'entertainment',
  Health: 'health',
  Education: 'education',
  Investment: 'investments',
  Insurance: 'insurance',
  'Loan EMI': 'loan EMIs',
  // "Spend less on cash" names the notes, not the habit.
  Cash: 'cash withdrawals',
  Transfers: 'transfers',
  'Fees & charges': 'fees & charges',
}

const CATEGORIES: ReadonlyMap<string, string> = new Map(Object.entries(CATEGORY))

/**
 * A target or a merchant as the object of a sentence: "Spend less on coffee shops", "14 days on
 * fast food". A brand, or a name this file doesn't know, comes back exactly as it went in.
 */
export function inSentence(name: string): string {
  return KINDS.get(name) ?? CATEGORIES.get(name) ?? name
}

/**
 * A kind of place in front of another noun, where it stays singular: "fast food spending",
 * "coffee shop spending". Anything else comes back as it went in.
 */
export function asModifier(name: string): string {
  return KINDS.has(name) ? name.toLowerCase() : name
}

/**
 * A challenge's own name. The target leads and keeps its capital; the rest is sentence case —
 * "Fast food challenge", where the server's `name` says "Fast food Challenge".
 */
export function challengeTitle(name: string): string {
  return `${name} challenge`
}
