/**
 * Boot: configuration → composition root → listen. Nothing else lives here.
 *
 * One deployment constraint worth knowing before choosing infrastructure: the Runway backend
 * RPC handler joins the LiveKit room as a participant and holds that connection for the whole
 * conversation. That rules out Lambda for the avatar path — the API needs a persistent process,
 * and a SIGTERM has to drain the calls it is hosting before the process goes.
 */
import { describeConfig, loadConfig } from './config.ts'
import { buildRoot } from './composition/root.ts'

const config = loadConfig()
const root = await buildRoot(config)

root.app.log.info(describeConfig(config), 'configuration')

// 0.0.0.0 rather than loopback: a phone on the same wifi has to be able to reach this, which is
// the whole point of a mobile web app you can actually hold.
await root.app.listen({ port: config.PORT, host: config.HOST })

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    root.app.log.info({ signal }, 'draining')
    root
      .close()
      .catch((err: Error) => root.app.log.error({ err: err.message }, 'drain failed'))
      .finally(() => process.exit(0))
  })
}
