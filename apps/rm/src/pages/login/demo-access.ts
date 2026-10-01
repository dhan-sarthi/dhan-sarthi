/**
 * The two demo desk accounts, shown on the sign-in page under "Demo access" so a reviewer can get
 * in with one click (docs/product/rm-console.md, "Users and sign-in"). These are the console's
 * own staff logins, not customers: no persona, account or figure from the book is written here,
 * and the server still checks the password against its scrypt hash like any other.
 *
 * The passwords must match the desk users in packages/fixtures; the console cannot import them
 * from there (a client never ships fixtures), so they are repeated here on purpose.
 */
export interface DemoDesk {
  employeeNo: string
  password: string
  name: string
  desk: string
  /** One line on what signing in as this RM shows. */
  note: string
}

export const DEMO_DESKS: readonly DemoDesk[] = [
  {
    employeeNo: '204117',
    password: 'desk-204117',
    name: 'Meera Joshi',
    desk: 'Digital Wealth Desk, Mumbai',
    note: 'The larger book, with the four app customers in it',
  },
  {
    employeeNo: '204388',
    password: 'desk-204388',
    name: 'Arjun Menon',
    desk: 'Digital Wealth Desk, Bengaluru',
    note: 'A second book, to show that one RM cannot open another’s customers',
  },
]
