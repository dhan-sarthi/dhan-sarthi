/**
 * What the Character is told, and what it is allowed to decide.
 *
 * Runway owns the conversation now: its model, its speech recognition, the Character's own
 * cloned voice. That changes where our leverage is. We no longer choose the words, so the two
 * things that still matter are what the model knows when it starts, and what it has to ask us
 * before it can answer.
 *
 *   knows        — the brief below, injected as the session's `personality` override. Built
 *                  here from the derived snapshot rather than passed up from the browser, so
 *                  the system prompt behind a compliance claim is not client-editable.
 *
 *   has to ask   — the `check_suitability` tool. Runway's model cannot reach a verdict on its
 *                  own; the rules in suitability.js do, and the model only phrases the answer.
 *                  That is the same guarantee as before, moved from our prompt to a tool
 *                  boundary, which is the stronger place for it.
 *
 * Mid-conversation context works the same way round: there is no API for pushing new facts
 * into a live session, so anything that changes while talking has to be something the model
 * pulls. Hence tools rather than updates.
 */

import { evaluate } from './suitability.js'

const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`

/**
 * The customer's position, in the words the model should reason in. Kept well inside the
 * 10,000-character `personality` ceiling — a brief is not a data dump, and everything here
 * is also on screen, which is the point of deriving both from one snapshot.
 */
export function buildBrief(snapshot) {
  const d = snapshot?.derived ?? {}
  const c = snapshot?.customer ?? {}
  const name = c.custName || c.name || 'this customer'
  const riskProfile = c.riskProfile || 'Balanced'

  const position = [
    `Name: ${name}. Risk profile on file: ${riskProfile}. Dependents: ${d.dependents ?? 0}.`,
    `Money in per month: ${inr(d.monthlyInflow)}. Money out: ${inr(d.monthlyOutflow)}. Committed EMIs: ${inr(d.emiTotal)}.`,
    `Investable monthly surplus after everything committed: ${inr(d.investableSurplus)}.`,
    `Sitting idle in savings: ${inr(d.idleBalance)}, earning ${(d.savingsRate * 100).toFixed(0)}% while prices rise ${(d.inflation * 100).toFixed(0)}% — a gap of about ${inr(d.idleCostPerYear)} a year.`,
    `Emergency buffer: ${d.emergencyFundMonths} months of outgoings.`,
    `Existing SIPs: ${inr(d.currentSip)} a month. Invested: ${inr(d.invested)} of ${inr(d.netWorth)} net worth (${d.investedPctOfNetWorth}%).`,
    d.topCategory ? `Largest spend category: ${d.topCategory} at ${inr(d.topCategoryAmount)}.` : null,
    d.hasHighInterestDebt ? 'Has high-interest debt outstanding (18% APR or above).' : 'No high-interest debt.',
    d.missedEmi ? 'There is a missed loan repayment on record.' : 'No missed repayments.',
    d.hasTermCover ? 'Holds term cover.' : 'Holds no term life cover.',
  ].filter(Boolean).join('\n')

  const personality = `You are Uday, a senior wealth adviser at IDBI Bank speaking with a customer in India.

You have already read the last six months of this customer's account. Their position:

${position}

How to talk:
- Speak plainly, in the register a good bank manager uses: warm, direct, never salesy.
- Amounts in rupees, spoken naturally ("one lakh seventy-two thousand", not "172000").
- Say the number that matters, then what it means. Diagnose before you suggest anything.
- Short turns. This is a conversation, not a presentation. Let them interrupt you.
- Never invent a figure. Every number you say must come from the position above or from a tool result.

Suitability — this part is not yours to judge:
- Before you recommend, endorse, or agree to ANY specific product, call check_suitability and
  wait for the verdict. That includes a product the customer raises themselves.
- If the verdict is BLOCKED, say the reason it gives, in your own voice, and do not recommend
  the product — not even with a caveat. Refusing well is the job.
- If the verdict is PASS, you may recommend it inside the surplus above.
- Never state or imply a suitability conclusion you have not received from the tool.`

  const startScript = d.idleBalance > 0
    ? `Namaste. I have been through the last six months of your account, and one thing stands out — there is about ${inr(d.idleBalance)} sitting in savings doing very little. Shall we start there?`
    : 'Namaste. I have been through the last six months of your account. Shall we start with where your money is going?'

  return { personality, startScript, facts: d, customer: { ...c, riskProfile } }
}

/**
 * Tool declarations sent at session creation.
 *
 * `backend_rpc` is a round trip into this process, so its timeout is real latency the customer
 * hears as a pause. 6s leaves room for the rules plus the audit write while staying under the
 * 8s ceiling.
 */
export function toolDefinitions() {
  return [
    {
      type: 'backend_rpc',
      name: 'check_suitability',
      description:
        'Run a specific product through the bank\'s deterministic suitability rules before recommending it, endorsing it, or agreeing to it. Returns a verdict of PASS or BLOCKED with the reason. You must call this before recommending any named product, including one the customer brings up themselves. You may not reach a suitability conclusion yourself.',
      timeoutSeconds: 6,
      parameters: [
        {
          type: 'string',
          name: 'product_name',
          description: 'The product being considered, as close to the shelf name as possible, e.g. "LIC Market Plus ULIP" or "IDBI Nifty Index Fund".',
          required: true,
        },
        {
          type: 'number',
          name: 'monthly_amount',
          description: 'The monthly rupee amount under discussion. Pass 0 if no amount has been named yet.',
          required: false,
        },
      ],
    },
    {
      type: 'client_event',
      name: 'show_artifact',
      description:
        'Put a visual on the customer\'s screen the moment you say the thing it shows. Call it as you speak, not afterwards. Use "idle" when you name the idle balance, "projection" when you discuss what a monthly amount grows into, "suitability" when a product has just been blocked, and "comparison" when you offer a cheaper alternative.',
      parameters: [
        {
          type: 'string',
          name: 'kind',
          description: 'Which visual to show.',
          enum: ['idle', 'projection', 'suitability', 'comparison'],
          required: true,
        },
        {
          type: 'number',
          name: 'monthly_amount',
          description: 'The monthly rupee amount, when the visual is a projection.',
          required: false,
        },
      ],
    },
  ]
}

/**
 * Handlers for the backend_rpc tools, closed over this session's customer.
 *
 * The verdict comes from suitability.js and nowhere else. `onVerdict` is where the audit
 * record is written, so a blocked recommendation leaves the same evidence it always did.
 */
export function makeToolHandlers({ facts, customer, shelf = [], log, onVerdict }) {
  return {
    async check_suitability(args) {
      const requested = String(args?.product_name ?? '').trim()
      const amount = Number(args?.monthly_amount ?? 0) || 0

      // The model speaks product names, not IDs. Match loosely, and if nothing matches, say
      // so rather than guessing — a verdict on the wrong product is worse than no verdict.
      const needle = requested.toLowerCase()
      const product = shelf.find((p) => p.name?.toLowerCase() === needle)
        || shelf.find((p) => needle && (p.name?.toLowerCase().includes(needle) || needle.includes(p.name?.toLowerCase())))

      if (!product) {
        log?.warn({ requested, shelf: shelf.map((p) => p.name) }, 'check_suitability: product not on shelf')
        return {
          verdict: 'UNKNOWN_PRODUCT',
          spoken: `I cannot find ${requested || 'that product'} on our shelf, so I am not able to check it. Let me stay with what I can actually verify.`,
        }
      }

      const result = evaluate({
        product,
        customer,
        facts,
        amount,
        alternatives: shelf.filter((p) => p.productId !== product.productId),
      })

      log?.info(
        { tool: 'check_suitability', product: product.name, amount, verdict: result.verdict, ruleId: result.ruleId },
        'suitability gate evaluated for avatar session',
      )
      await onVerdict?.({ product, amount, result })

      // Only what the model needs to phrase an answer. `spoken` is the sentence the rules
      // wrote, so the customer hears the compliance-approved wording.
      return {
        verdict: result.verdict,
        product: product.name,
        reason: result.spoken ?? result.recorded,
        rule_id: result.ruleId ?? null,
        alternative: result.alternative?.name ?? null,
      }
    },
  }
}
