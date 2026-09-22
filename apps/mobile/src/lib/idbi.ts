// The bank's own ways in, for the few things the app cannot do itself — talking to a person.

const NUMBER = '1800-209-4324'

/**
 * IDBI's phone banking line: toll-free, answered by people, as printed on the bank's 24x7 care
 * page (idbi.bank.in/24-7-care.aspx). The number is a control's words as well as its link, so a
 * phone that cannot dial still shows what to dial. The notices' hand-off, Spend's "talk to a
 * person" insight and Today's "talk to your relationship manager" card all dial it, with the same
 * words: `label` on the control, `hint` for a screen reader, `failed` for the toast when nothing
 * on the device can place a call.
 */
export const IDBI_CARE = {
  number: NUMBER,
  href: 'tel:18002094324',
  label: `Call ${NUMBER}`,
  hint: 'Toll-free. Opens your phone to call IDBI phone banking.',
  failed: `Couldn't start the call. The number is ${NUMBER}.`,
} as const

/**
 * The bank's contact page: its phone lines, the branch locator, and so the way to a relationship
 * manager, who sits at a branch. Checked 22 September 2026 with a browser user agent: GET answers
 * 200 ("Contact Us | IDBI Bank Contact Information"), and idbibank.in/contact-us.aspx redirects
 * here. The server turns every HEAD request, its home page's included, into a 302 to its 404
 * page, so `curl -I` says nothing about whether the page is there.
 */
export const IDBI_CONTACT = {
  url: 'https://www.idbi.bank.in/contact-us.aspx',
  label: 'Contact IDBI Bank',
  hint: 'Phone lines and the branch locator. Opens in your browser.',
} as const
