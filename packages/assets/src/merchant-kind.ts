/**
 * What a merchant actually *is*, when it has no logo.
 *
 * The spend category says "Food & dining". That is true of a pizza order, a chai stall and a
 * biryani house, and drawing all three as the same covered dish is how a statement stops being
 * read — the eye learns the picture carries no information and skips it. This maps the name to
 * something more specific, and the icon set has a drawing for each.
 *
 * Matching is on words, longest first, against a lowercased name. Deliberately conservative: a
 * wrong picture is worse than the category's own, which is always a true statement about the row.
 */
export type MerchantKind =
  | 'pizza' | 'biryani' | 'chai' | 'coffee' | 'sweets' | 'thali' | 'burger' | 'snacks'
  | 'kirana' | 'supermarket'
  | 'metro' | 'fuel' | 'bike-taxi' | 'train' | 'flight'
  | 'electricity' | 'gas' | 'broadband' | 'mobile' | 'water'
  | 'pharmacy' | 'lab-test' | 'clinic' | 'gym'
  | 'streaming' | 'music' | 'gaming' | 'cinema'
  | 'clothing' | 'electronics' | 'jewellery' | 'books' | 'eyewear' | 'beauty' | 'software'
  | 'school' | 'person' | 'interest'

/**
 * Word → kind. Order does not matter; the longest matching word wins, so "coffee house" beats
 * "house" and "gas agency" is not caught by a shorter rule.
 */
const WORDS: ReadonlyArray<readonly [string, MerchantKind]> = [
  ['pizza', 'pizza'], ['dominos', 'pizza'],
  ['biryani', 'biryani'], ['kebab', 'biryani'], ['mandi', 'biryani'],
  ['chai', 'chai'], ['tapri', 'chai'], ['chaayos', 'chai'], ['tea', 'chai'],
  ['coffee', 'coffee'], ['cafe', 'coffee'], ['ccd', 'coffee'], ['barista', 'coffee'],
  ['sweets', 'sweets'], ['mithai', 'sweets'], ['haldirams', 'sweets'], ['bakery', 'sweets'],
  ['bhojanalay', 'thali'], ['thali', 'thali'], ['dhaba', 'thali'], ['mess', 'thali'],
  ['burger', 'burger'], ['kfc', 'burger'], ['mcdonald', 'burger'],
  ['sarafa', 'snacks'], ['chaat', 'snacks'], ['bazaar', 'snacks'], ['snack', 'snacks'],

  ['kirana', 'kirana'], ['general store', 'kirana'], ['provision', 'kirana'],
  ['supermart', 'supermarket'], ['hypermarket', 'supermarket'], ['supermarket', 'supermarket'],
  ['mart', 'supermarket'], ['fresh', 'supermarket'],

  ['metro', 'metro'],
  ['petrol', 'fuel'], ['petroleum', 'fuel'], ['hpcl', 'fuel'], ['bpcl', 'fuel'],
  ['indian oil', 'fuel'], ['iocl', 'fuel'], ['fuel', 'fuel'], ['shell', 'fuel'],
  ['rapido', 'bike-taxi'], ['bounce', 'bike-taxi'],
  ['irctc', 'train'], ['railway', 'train'], ['rail', 'train'],
  ['indigo', 'flight'], ['air india', 'flight'], ['spicejet', 'flight'], ['vistara', 'flight'],

  ['msedcl', 'electricity'], ['mppkvvcl', 'electricity'], ['kseb', 'electricity'],
  ['bescom', 'electricity'], ['electricity', 'electricity'], ['power', 'electricity'],
  ['gas', 'gas'], ['indane', 'gas'], ['mngl', 'gas'], ['ioagpl', 'gas'], ['lpg', 'gas'],
  ['broadband', 'broadband'], ['fibernet', 'broadband'], ['fiber', 'broadband'],
  ['asianet', 'broadband'], ['wifi', 'broadband'],
  ['prepaid', 'mobile'], ['postpaid', 'mobile'], ['recharge', 'mobile'],
  ['airtel', 'mobile'], ['vodafone', 'mobile'], ['bsnl', 'mobile'],
  ['water', 'water'], ['jal', 'water'],

  ['pharmacy', 'pharmacy'], ['pharmeasy', 'pharmacy'], ['medplus', 'pharmacy'],
  ['chemist', 'pharmacy'], ['1mg', 'pharmacy'], ['apollo', 'pharmacy'],
  ['thyrocare', 'lab-test'], ['diagnostic', 'lab-test'], ['pathlab', 'lab-test'], ['lab', 'lab-test'],
  ['hospital', 'clinic'], ['clinic', 'clinic'], ['practo', 'clinic'], ['nursing', 'clinic'],
  ['gym', 'gym'], ['cultfit', 'gym'], ['fitness', 'gym'],

  ['netflix', 'streaming'], ['hotstar', 'streaming'], ['jiohotstar', 'streaming'],
  ['prime', 'streaming'], ['youtube', 'streaming'], ['sonyliv', 'streaming'], ['zee5', 'streaming'],
  ['spotify', 'music'], ['audible', 'music'], ['gaana', 'music'], ['wynk', 'music'],
  ['steam', 'gaming'], ['smaaash', 'gaming'], ['playstation', 'gaming'], ['xbox', 'gaming'],
  ['pvr', 'cinema'], ['inox', 'cinema'], ['cinepolis', 'cinema'], ['bookmyshow', 'cinema'],
  ['cinema', 'cinema'], ['multiplex', 'cinema'],

  ['zudio', 'clothing'], ['myntra', 'clothing'], ['ajio', 'clothing'], ['meesho', 'clothing'],
  ['decathlon', 'clothing'], ['pantaloons', 'clothing'], ['westside', 'clothing'],
  ['croma', 'electronics'], ['reliance digital', 'electronics'], ['vijay sales', 'electronics'],
  ['titan', 'jewellery'], ['tanishq', 'jewellery'], ['jeweller', 'jewellery'],
  ['crossword', 'books'], ['bookstore', 'books'], ['books', 'books'],
  ['lenskart', 'eyewear'], ['optical', 'eyewear'],
  ['nykaa', 'beauty'], ['salon', 'beauty'], ['cosmetic', 'beauty'],
  ['adobe', 'software'], ['canva', 'software'], ['google one', 'software'],
  ['icloud', 'software'], ['microsoft', 'software'],

  ['vidyalaya', 'school'], ['school', 'school'], ['college', 'school'],
  ['daycare', 'school'], ['academy', 'school'], ['tuition', 'school'],

  ['interest', 'interest'],
]

const SORTED = [...WORDS].sort((a, b) => b[0].length - a[0].length)

/** The kind, or undefined when nothing matches and the category's own icon should stand. */
export function merchantKind(merchant: string | null | undefined): MerchantKind | undefined {
  if (!merchant) return undefined
  const name = merchant.toLowerCase()
  for (const [word, kind] of SORTED) {
    if (name.includes(word)) return kind
  }
  return undefined
}
