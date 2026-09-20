/**
 * The customer, as a block of sentences a model may quote from.
 *
 * One builder, two consumers: the avatar's personality brief and the text tier's prompt. It has
 * to be one, because the two are the same advisor and a figure that differs between the call and
 * the chat is a figure neither can be trusted on. Every line is read off the same `ServerView`
 * the screens render, so the advisor cannot quote a number the UI does not show.
 *
 * Nothing is computed here. If a figure is not already on the View, it does not belong in a
 * sentence anyone says.
 */
import type { ServerView } from './advisory.service.ts'

export const inr = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`

export function factLines(view: ServerView): string[] {
  const s = view.snapshot
  const stage = view.roadmap.stages[view.roadmap.currentStageIndex]
  const primary = view.plan.primary

  return [
    `Customer: ${s.customer.name}, ${s.customer.age}, ${s.customer.city}. ` +
      `${s.customer.dependents} dependents. Risk profile ${s.customer.riskProfile}. ` +
      `Tax regime: ${s.customer.taxRegime}.`,
    `Income ${inr(s.income.monthly)}/month, ${s.income.stability}.`,
    `Committed ${inr(s.commitments.total)}/month. Discretionary ${inr(s.discretionary.monthly)}.`,
    `Deployable surplus ${inr(s.surplus.deployable)}/month.`,
    `Savings ${inr(s.balances.savings)}; ${inr(s.balances.idleFloor)} untouched for ${s.balances.idleMonths} months.`,
    `Buffer covers ${s.buffer.monthsCovered} months. Debt ${inr(s.debt.total)} at up to ${s.debt.highestRate}%.`,
    ...(s.debt.endingSoon
      ? [
          `${s.debt.endingSoon.loanType} ends in ${s.debt.endingSoon.monthsLeft} months, freeing ${inr(s.debt.endingSoon.emiAmount)}/month.`,
        ]
      : []),
    `Life cover in force ${inr(s.protection.lifeCoverInForce)}; indicative need ${inr(s.protection.lifeCoverNeeded)}.`,
    `Goal: ${view.goal.purpose ?? view.goal.kind}, ${inr(view.goal.targetAmount)} by ${view.goal.targetDate}.`,
    ...(stage ? [`Current stage of the plan: ${stage.label}. Why: ${stage.why}`] : []),
    ...(primary ? [`Today's one action: ${primary.label}. ${primary.detail}`] : []),
    `Safe to spend: about ${inr(view.plan.safeToSpend.perDay)} a day for ${view.plan.safeToSpend.daysToSalary} days.`,
  ]
}
