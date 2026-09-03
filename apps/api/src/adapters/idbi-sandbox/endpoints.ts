/**
 * IDBI's endpoints as we know them: registered, not guessed.
 *
 * Two families. The numbered services (456 customer master, 394 accounts, 393 statement, 402
 * loan overdues, 362 liens) are the catalogue seen inside the hackathon sandbox and nowhere
 * public; `docs/engineering/schema/README.md` §0.3 records that no public source corroborates
 * them, so every entry here carries `verified: false` until IDBI's own documentation has been
 * read against it. The block endpoints are the shape of *our request* — one call per data
 * block of `docs/integration/data-requirements.md`, the five block-00 parameters on the query
 * string, block 08 riding on every response. The adapter calls the block endpoints; the
 * numbered ones are here so the week-one capture (`IdbiClient.service`) can pull each raw
 * response into staging before anyone maps a field.
 *
 * When the sandbox spec lands, a path that differs is a one-line change to a template below,
 * and the offline sandbox routes by the same table, so the tests move with it.
 */

/** The seven groups a `data_blocks` selector can name. Block 08 (meta) rides on every response. */
export const DATA_BLOCKS = [
  'PROFILE',
  'ACCOUNTS',
  'TXN',
  'HOLDINGS',
  'LIABILITIES',
  'SHELF',
  'SIGNALS',
] as const
export type DataBlock = (typeof DATA_BLOCKS)[number]

export type ServiceCode = '456' | '394' | '393' | '402' | '362'

export interface EndpointSpec {
  /** IDBI's service number, or `BLOCK_<name>` for an endpoint of our own request. */
  code: ServiceCode | `BLOCK_${DataBlock}`
  name: string
  method: 'GET'
  /** `{customer_id}` is substituted; every block-00 parameter travels on the query string. */
  pathTemplate: string
  /** The group of data-requirements.md this answers. Liens answer none of the 93 fields. */
  block: DataBlock | null
  /** 393 pages its statement; the block endpoint over it inherits that. */
  paged: boolean
  /** Which numbered service a block endpoint is expected to sit over, where the catalogue has one. */
  backedBy: ServiceCode | null
  /** Literally false. Flip it per endpoint on the day IDBI's documentation is read against it. */
  verified: false
  source: 'catalogue' | 'data-requirements'
  notes: string
}

const CATALOGUE_NOTE = 'Numbered catalogue seen in team notes; not publicly corroborated.'

export const ENDPOINTS: readonly EndpointSpec[] = [
  /* The numbered catalogue ------------------------------------------------ */
  {
    code: '456',
    name: 'Customer master (CIF)',
    method: 'GET',
    pathTemplate: '/api/v1/services/456/customer-master/{customer_id}',
    block: 'PROFILE',
    paged: false,
    backedBy: null,
    verified: false,
    source: 'catalogue',
    notes: CATALOGUE_NOTE,
  },
  {
    code: '394',
    name: 'Accounts',
    method: 'GET',
    pathTemplate: '/api/v1/services/394/accounts/{customer_id}',
    block: 'ACCOUNTS',
    paged: false,
    backedBy: null,
    verified: false,
    source: 'catalogue',
    notes: CATALOGUE_NOTE,
  },
  {
    code: '393',
    name: 'Account statement',
    method: 'GET',
    pathTemplate: '/api/v1/services/393/statement/{customer_id}',
    block: 'TXN',
    paged: true,
    backedBy: null,
    verified: false,
    source: 'catalogue',
    notes: `${CATALOGUE_NOTE} Paged: page and page_size on the query, total_pages on the response.`,
  },
  {
    code: '402',
    name: 'Loan overdues',
    method: 'GET',
    pathTemplate: '/api/v1/services/402/loan-overdues/{customer_id}',
    block: 'LIABILITIES',
    paged: false,
    backedBy: null,
    verified: false,
    source: 'catalogue',
    notes: `${CATALOGUE_NOTE} 442 (loan account details) is assumed to sit beside it.`,
  },
  {
    code: '362',
    name: 'Liens',
    method: 'GET',
    pathTemplate: '/api/v1/services/362/liens/{customer_id}',
    block: null,
    paged: false,
    backedBy: null,
    verified: false,
    source: 'catalogue',
    notes: `${CATALOGUE_NOTE} No field in the 93; a lien lowers the usable floor and is a candidate for account_snapshots.lien_amount.`,
  },

  /* The request in data-requirements.md, one endpoint per block ------------ */
  ...(
    [
      ['PROFILE', 'profile', '456', '01 customer profile'],
      ['ACCOUNTS', 'accounts', '394', '02 accounts and balances'],
      ['TXN', 'transactions', '393', '03 transactions'],
      ['HOLDINGS', 'holdings', null, '04 holdings; the catalogue has no MF or insurance endpoint'],
      ['LIABILITIES', 'liabilities', '402', '05 liabilities'],
      ['SHELF', 'product-shelf', null, '06 product shelf; the catalogue has no shelf endpoint'],
      ['SIGNALS', 'signals', null, '07 derived signals; the engine computes its own twin'],
    ] as const
  ).map(([block, segment, backedBy, group]): EndpointSpec => ({
    code: `BLOCK_${block}`,
    name: `Data block ${block}`,
    method: 'GET',
    pathTemplate: `/api/v1/wealth-advisory/${segment}`,
    block,
    paged: block === 'TXN',
    backedBy,
    verified: false,
    source: 'data-requirements',
    notes: `Group ${group}. Block-00 parameters on the query string; block 08 on the response.`,
  })),
]

export function endpointFor(block: DataBlock): EndpointSpec {
  const found = ENDPOINTS.find((e) => e.source === 'data-requirements' && e.block === block)
  if (!found) throw new Error(`no block endpoint registered for ${block}`)
  return found
}

export function serviceEndpoint(code: ServiceCode): EndpointSpec {
  const found = ENDPOINTS.find((e) => e.code === code)
  if (!found) throw new Error(`no numbered service ${code} registered`)
  return found
}

export function renderPath(spec: EndpointSpec, params: { customer_id: string }): string {
  return spec.pathTemplate.replace('{customer_id}', encodeURIComponent(params.customer_id))
}

/** The registry as a router, for the offline sandbox: which spec a request path names. */
export function matchPath(
  pathname: string,
): { spec: EndpointSpec; params: { customer_id: string | null } } | null {
  for (const spec of ENDPOINTS) {
    const pattern = new RegExp(
      `^${spec.pathTemplate.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace('{customer_id}', '([^/]+)')}$`,
    )
    const m = pattern.exec(pathname)
    if (m) {
      return {
        spec,
        params: { customer_id: m[1] === undefined ? null : decodeURIComponent(m[1]) },
      }
    }
  }
  return null
}
