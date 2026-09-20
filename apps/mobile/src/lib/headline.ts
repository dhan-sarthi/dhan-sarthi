/**
 * What one advice record is about, in a sentence.
 *
 * A record written by a plan action names the action; one written by a direct suitability
 * check has no action — the customer asked about a product on the shelf — so it names the
 * product instead. Both are advice and both are on the record; only the trigger differs.
 */
export function headline(
  actionKind: string | null,
  productId: string | null,
  names: ReadonlyMap<string, string>,
): string {
  if (actionKind) return sentence(actionKind.replace(/_/g, ' '))
  if (productId) return `Asked about ${names.get(productId) ?? productId}`
  return 'Advice given'
}

const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
