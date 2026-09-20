/**
 * Runway's own words, asserted where Runway's own words are written.
 *
 * `ToolDefinition` in `@dhan/contracts` is provider-neutral — a name, a description, a JSON
 * Schema, a timeout — because the port hands the same array to both adapters. Everything Runway
 * needs on top of that is invented here in `toRunwayToolBody`: the `backend_rpc` discriminator,
 * and the flat parameter list the spike found the documented body actually takes.
 *
 * `registry.test.ts` used to assert the discriminator on the contracts-side output, back when
 * the contract stamped it. The behaviour it pinned is real and unchanged — a session created
 * without `type: 'backend_rpc'` registers no tools at all — so the assertion moved here rather
 * than being dropped with the field.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { toolJsonSchemas } from '@dhan/contracts'
import { toRunwayToolBody } from '../../src/adapters/runway/transport.ts'

describe('the Runway tool body', () => {
  it('stamps backend_rpc on every tool, and carries the name and timeout through', () => {
    const bodies = toolJsonSchemas().map(toRunwayToolBody)

    assert.deepEqual(
      bodies.map((b) => b.name),
      ['check_suitability', 'query_spend', 'get_plan'],
    )
    for (const body of bodies) {
      assert.equal(body.type, 'backend_rpc')
      assert.ok(body.timeoutSeconds >= 1 && body.timeoutSeconds <= 8, body.name)
      assert.ok(body.description.length > 40, body.name)
    }
  })

  it('flattens the JSON Schema into the typed parameter list Runway documents', () => {
    const [checkSuitability] = toolJsonSchemas()
      .filter((d) => d.name === 'check_suitability')
      .map(toRunwayToolBody)

    assert.ok(checkSuitability, 'check_suitability is in the tool list')
    // Not a schema object: a list, each entry carrying its own type, and `required` as a flag on
    // the parameter rather than a sibling array of names.
    assert.deepEqual(
      checkSuitability.parameters.map((p) => [p.name, p.type, p.required]),
      [
        ['product_name', 'string', true],
        ['monthly_amount', 'number', false],
      ],
    )
  })
})
