/**
 * The slice of pino the application and adapters log through. Fastify's `app.log` satisfies
 * it; tests pass `silentLogger`. Nothing below http/ imports pino directly.
 */
export interface Logger {
  info(context: object, message: string): void
  warn(context: object, message: string): void
  error(context: object, message: string): void
}

export const silentLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
}
