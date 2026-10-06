/**
 * The relationship manager on the other end of a request, as every RM service receives them.
 *
 * Resolved once per request from the bearer (`http/auth.ts`), like a reviewer's session. A
 * service takes this rather than an id so that "which RM" can never be a parameter a client
 * supplies: the book is scoped by who signed in, not by what they asked for.
 */
import { initials } from '@dhan/core'
import type { RmProfile } from '@dhan/contracts'
import type { RmUser } from '../../ports/index.ts'

export interface RmCaller {
  rmId: string
  employeeNo: string
  name: string
  desk: string
  city: string
  /** The RM session the bearer opened, so sign-out revokes this console and no other. */
  sessionId: string
}

/** The wire profile: what the top bar, the sign-in answer and a customer's "assigned RM" show. */
export function rmProfile(
  rm: Pick<RmUser, 'rmId' | 'employeeNo' | 'name' | 'desk' | 'city'>,
): RmProfile {
  return {
    rmId: rm.rmId,
    employeeNo: rm.employeeNo,
    name: rm.name,
    initials: initials(rm.name),
    desk: rm.desk,
    city: rm.city,
  }
}
