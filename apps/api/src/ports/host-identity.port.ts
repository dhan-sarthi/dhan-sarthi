/**
 * The Phase-2 seam for GO Mobile+: the host app hands the WebView a short-lived token, and this
 * port turns it into a customer.
 *
 * Under an adapter that answers, the picker route is disabled and `POST /sessions` takes the
 * host token instead of a cif. Implemented today only by `NotImplementedHostIdentity`, which
 * returns null and logs; the real exchange verifies against the bank's JWKS once the host
 * token format is known. See docs/integration/go-mobile-plus.md.
 */
export interface HostIdentityPort {
  exchange(hostToken: string): Promise<{ cif: string } | null>
}
