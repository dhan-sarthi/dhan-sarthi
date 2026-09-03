/**
 * The Runway tools, and the JSON Schema Runway needs to register them.
 *
 * Three tools, all `backend_rpc`: a round trip to the API for the things a model may not do —
 * judge suitability, add up a ledger, recall the plan. The model phrases; it does not decide.
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

/** One entry of the `tools` array on POST /v1/realtime_sessions. */
export interface RunwayToolDefinition {
  type: 'backend_rpc'
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

/** The tool definitions in the shape Runway's session-create body takes. */
export function toolJsonSchemas(): RunwayToolDefinition[] {
  return TOOL_LIST.map((tool) => ({
    type: 'backend_rpc',
    name: tool.name,
    description: tool.description,
    parameters: jsonSchemaOf(tool.args),
    timeoutSeconds: tool.timeoutSeconds,
  }))
}

/** The name the LLD uses for the same thing. */
export const toRunwayTools = toolJsonSchemas
