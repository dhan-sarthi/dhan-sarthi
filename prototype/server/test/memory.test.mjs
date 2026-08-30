// End-to-end memory test with the model calls stubbed, so the pipeline is provable
// without burning an API key.
const canned = {
  'sip': { summary: 'Rohan committed to a ₹10,000/month SIP but managed ₹4,000 this month; said the Diwali spending got away from him.',
           topics: ['sip','commitment','festival-spending'], emotionalTone: 'frustrated',
           commitment: { what: 'monthly SIP', amount: 10000, cadence: 'monthly' }, worthRemembering: true },
  'health': { summary: 'Rohan mentioned his diabetes diagnosis and worries about treatment costs.',
              topics: ['health','medical'], emotionalTone: 'anxious', commitment: null, worthRemembering: true },
  'chat': { summary: 'Rohan said hello.', topics: ['smalltalk'], emotionalTone: 'neutral', commitment: null, worthRemembering: false },
}
// crude deterministic embedding: bag of chars -> 32 dims. Enough to test ranking behaviour.
function fakeEmbed(text) {
  const v = new Array(32).fill(0)
  for (const ch of text.toLowerCase()) v[ch.charCodeAt(0) % 32] += 1
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1
  return v.map((x) => x / n)
}
globalThis.fetch = async (url, opts) => {
  const body = JSON.parse(opts.body)
  if (body.task === 'embed') return { ok: true, json: async () => ({ embedding: fakeEmbed(body.input) }) }
  const key = body.user.includes('diabetes') ? 'health' : body.user.includes('SIP') || body.user.includes('sip') ? 'sip' : 'chat'
  return { ok: true, json: async () => ({ content: JSON.stringify(canned[key]) }) }
}

const { remember, recall, openCommitments, listMemories } = await import('../src/lib/memory/index.js')
const CUST = 'test-rohan'

console.log('1. remember a real conversation about a missed SIP commitment')
const m1 = await remember(CUST, [
  { role: 'user', text: 'I said I would do a 10000 sip but I only managed 4000 this month' },
  { role: 'assistant', text: 'What got in the way?' },
  { role: 'user', text: 'Diwali spending got away from me honestly' },
])
console.log('   stored:', m1 ? `"${m1.text.slice(0,60)}..."` : 'nothing')
console.log('   topics:', m1?.topics, '| tone:', m1?.emotionalTone, '| commitment:', m1?.commitment?.amount)

console.log('\n2. safeguard: a conversation about a medical diagnosis')
const m2 = await remember(CUST, [
  { role: 'user', text: 'I got a diabetes diagnosis and I am worried about treatment costs going forward' },
])
console.log('   stored:', m2 ? 'STORED — SAFEGUARD FAILED' : 'correctly discarded')

console.log('\n3. small talk should not be remembered')
const m3 = await remember(CUST, [{ role: 'user', text: 'hello there how are you doing today my friend' }])
console.log('   stored:', m3 ? 'STORED — should not have been' : 'correctly discarded')

console.log('\n4. total memories held:', (await listMemories(CUST)).length)

console.log('\n5. recall before the next conversation')
const recalled = await recall(CUST, 'talking about increasing his monthly sip investment', { topics: ['sip'] })
recalled.forEach((m) => console.log(`   "${m.text.slice(0,70)}..." (${m.whenLabel}, score ${m.score.toFixed(3)})`))

console.log('\n6. open commitments the future self should follow up on')
console.log('  ', await openCommitments(CUST))
