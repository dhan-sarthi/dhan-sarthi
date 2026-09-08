import { z } from 'zod'
import { ErrorBodySchema, IsoDateSchema, MoneySchema } from '../common.ts'
import { EmploymentTypeSchema, RiskProfileSchema, TaxRegimeSchema } from '../domain.ts'
import { SESSION_ERRORS, defineRoute } from '../route.ts'

/**
 * The declared half of a customer's profile: the facts no bank endpoint carries.
 *
 * IDBI's twenty-four APIs contain no income, employment type, dependents, marital status,
 * language, risk profile or tax regime — 433 returns a hundred and six keys of one customer's
 * record and carries none of them. They are what a customer tells an adviser, so the app owns
 * them, this is where they are read and written, and Record → Your data marks the block
 * `declared` rather than `idbi`.
 */
export const DeclaredProfileSchema = z.object({
  cif: z.string(),
  maritalStatus: z.string(),
  dependents: z.number().int().min(0).max(20),
  employmentType: EmploymentTypeSchema,
  declaredAnnualIncome: MoneySchema,
  preferredLanguage: z.string(),
  riskProfile: RiskProfileSchema,
  taxRegime: TaxRegimeSchema,
  /**
   * Only present where the bank sends none. The bank's own date always wins, so this is a
   * fallback for a customer the sandbox holds no record or consented pull for.
   */
  dateOfBirth: IsoDateSchema.optional(),
  updatedAt: z.string(),
  /**
   * Which of these the app is still waiting on. A profile missing a date of birth cannot be
   * advised, because age gates every suitability rule, so the UI needs to know what to ask for
   * rather than discovering it as a 403.
   */
  missing: z.array(z.string()),
})
export type DeclaredProfileResponse = z.infer<typeof DeclaredProfileSchema>

export const getProfileRoute = defineRoute({
  id: 'getProfile',
  method: 'GET',
  path: '/api/v1/profile',
  summary:
    'The declared half of the session customer’s profile: income, employment, dependents, risk profile and tax regime, none of which any bank endpoint carries.',
  auth: 'session',
  response: { 200: DeclaredProfileSchema, ...SESSION_ERRORS },
})

/** Only the fields present move. An absent field means "leave it", never "clear it". */
export const ProfilePatchSchema = z
  .object({
    maritalStatus: z.string().min(1).max(40),
    dependents: z.number().int().min(0).max(20),
    employmentType: EmploymentTypeSchema,
    declaredAnnualIncome: MoneySchema,
    preferredLanguage: z.string().min(2).max(10),
    riskProfile: RiskProfileSchema,
    taxRegime: TaxRegimeSchema,
    dateOfBirth: IsoDateSchema,
  })
  .partial()
  .strict()
export type ProfilePatch = z.infer<typeof ProfilePatchSchema>

export const patchProfileRoute = defineRoute({
  id: 'patchProfile',
  method: 'PATCH',
  path: '/api/v1/profile',
  summary:
    'Update the declared profile. Changing income or risk profile changes the advice, so the next view is recomputed from it.',
  auth: 'session',
  request: { body: ProfilePatchSchema },
  response: { 200: DeclaredProfileSchema, 400: ErrorBodySchema, ...SESSION_ERRORS },
})
