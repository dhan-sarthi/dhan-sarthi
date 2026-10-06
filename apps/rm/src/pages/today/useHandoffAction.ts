import type { Handoff, RmToday } from '@dhan/contracts'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { keys, useUpdateHandoff } from '../../api/queries.ts'
import { describeError, toast } from '../../ui/index.ts'
import { applyHandoffStatus, firstName } from './derive.ts'

export type HandoffStatusChange = 'contacted' | 'resolved'

/**
 * Marking a request contacted or resolved, optimistically.
 *
 * The request changes the moment the RM clicks (a resolved one leaves the queue with its row);
 * the server's answer then refetches Today (the shared mutation invalidates it), which also moves
 * the queue and the asked-for-a-call figure. If the server refuses, Today is put back exactly as
 * it was and the toast says so in plain words: the request is still open, and nothing pretends
 * otherwise.
 */
export function useHandoffAction() {
  const client = useQueryClient()
  const mutation = useUpdateHandoff()
  const { mutateAsync } = mutation

  const run = useCallback(
    async (handoff: Handoff, status: HandoffStatusChange, note?: string): Promise<boolean> => {
      const key = keys.today()
      // A refetch already in flight would land on top of the optimistic list and undo it.
      await client.cancelQueries({ queryKey: key })
      const before = client.getQueryData<RmToday>(key)
      if (before) {
        client.setQueryData<RmToday>(
          key,
          applyHandoffStatus(before, handoff.id, status, note ?? null),
        )
      }
      const who = firstName(handoff.name)
      try {
        await mutateAsync({ handoffId: handoff.id, status, ...(note ? { note } : {}) })
        toast.success(status === 'resolved' ? 'Request resolved' : 'Marked as contacted', {
          description:
            status === 'resolved'
              ? `${who}’s request is closed. It stays on the journey.`
              : `${who}’s request stays on Today until it is resolved.`,
        })
        return true
      } catch (error) {
        if (before) client.setQueryData<RmToday>(key, before)
        toast.error(`${who}’s request was not updated`, { description: describeError(error) })
        return false
      }
    },
    [client, mutateAsync],
  )

  return {
    run,
    /** The request being sent right now, so only its buttons show progress. */
    pendingId: mutation.isPending ? (mutation.variables?.handoffId ?? null) : null,
  }
}
