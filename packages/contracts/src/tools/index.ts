/**
 * The three tools, and the JSON Schema a provider needs to register them.
 *
 * A tool is a round trip to the API for the things a model may not do — judge suitability, add
 * up a ledger, recall the plan. The model phrases; it does not decide.
 *
 * What a definition carries is the same for every provider: a name, a description the model
 * reads, a JSON Schema for the arguments, and how long the caller may take to answer. How that
 * is spelled on the wire is not: Runway wants `type: 'backend_rpc'` and a flat parameter list,
 * Anam wants a webhook row. Both spellings are built in their own adapter, from this.
 */
import type { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import type { ToolName } from '../domain.ts'
import { checkSuitabilityTool } from './check-suitability.ts'
import type { ToolContract } from './contract.ts'
import { getPlanTool } from './get-plan.ts'
import { querySpendTool } from './query-spend.ts'

export * from './contract.ts'
export * from './check-suitability.ts'
export * from './query-spend.ts'
export * from './get-plan.ts'

export const TOOLS = {
  check_suitability: checkSuitabilityTool,
  query_spend: querySpendTool,
  get_plan: getPlanTool,
} as const satisfies Record<ToolName, ToolContract>

export const TOOL_LIST: readonly ToolContract[] = Object.values(TOOLS)

export type ToolArgs<Name extends ToolName> = z.infer<(typeof TOOLS)[Name]['args']>
export type ToolResult<Name extends ToolName> = z.infer<(typeof TOOLS)[Name]['result']>

export type JsonSchema = Record<string, unknown>

/**
 * One tool, as everything downstream of the contract sees it.
 *
 * Nothing here is a provider's word. An adapter takes this and adds whatever its own body needs
 * — Runway's discriminator and flattened parameters in `toRunwayToolBody`, Anam's webhook url
 * and per-call header in `toAnamTools` — so the port between them can speak one language.
 */
export interface ToolDefinition {
  name: ToolName
  description: string
  parameters: JsonSchema
  timeoutSeconds: number
}

/** JSON Schema for a zod schema, inlined (no $ref) and without the draft banner. */
export function jsonSchemaOf(schema: z.ZodTypeAny): JsonSchema {
  const { $schema: _draft, ...rest } = zodToJsonSchema(schema, {
    $refStrategy: 'none',
    target: 'jsonSchema7',
  }) as JsonSchema
  return rest
}

/** The three tools with their arguments resolved to JSON Schema. What a session is opened with. */
export function toolJsonSchemas(): ToolDefinition[] {
  return TOOL_LIST.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: jsonSchemaOf(tool.args),
    timeoutSeconds: tool.timeoutSeconds,
  }))
}
