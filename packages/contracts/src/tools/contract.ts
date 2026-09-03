/**
 * The shape of one Runway tool.
 *
 * A tool is how the model asks us something it may not decide for itself. The argument and
 * result schemas are zod so the RPC handler can parse what the model sent (bad arguments become
 * a result the model can read, never an exception) and so the JSON Schema Runway needs can be
 * generated rather than hand-kept.
 */
import type { z } from 'zod'
import type { ToolName } from '../domain.ts'

export interface ToolContract<
  Name extends ToolName = ToolName,
  Args extends z.ZodTypeAny = z.ZodTypeAny,
  Result extends z.ZodTypeAny = z.ZodTypeAny,
> {
  readonly name: Name
  /** What the model reads to decide when to call it. Written for the model, not for us. */
  readonly description: string
  readonly args: Args
  readonly result: Result
  /** Runway allows 1–8 s. Sized to the handler's real budget, with room for the audit write. */
  readonly timeoutSeconds: number
}

export function defineTool<
  const Name extends ToolName,
  Args extends z.ZodTypeAny,
  Result extends z.ZodTypeAny,
>(tool: ToolContract<Name, Args, Result>): ToolContract<Name, Args, Result> {
  return tool
}
