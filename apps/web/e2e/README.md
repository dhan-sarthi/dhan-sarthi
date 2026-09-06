# Browser checks

Install Chromium once with `pnpm --filter @dhan/web exec playwright install chromium`, then run
`pnpm --filter @dhan/web test:e2e` from the repository root. The command builds the shared packages
and starts an isolated memory API on port 3101 and a production preview on port 5174. Both are stopped after the
run. An occupied port fails the run so the suite cannot silently use a shared or live service.
The API runs with the avatar disabled and does not load an environment file. The web build lives
under `node_modules/.cache/dhan-e2e-web`, so an unrelated source edit or regular build cannot
hot-reload the browser during a test.

The suite opens each of the three API-provided customers at 390×844 and 375×812. Without scrolling,
it measures both decision buttons against the scroll region and tab bar, checks their full
viewport intersection, and hit-tests their centres. It writes `fold-measurements.json` and
`first-screenful.png` under the ignored `apps/web/test-results/` directory for each combination.
Screenshots document the measured run; they are not pixel-golden assertions.

Behavior checks exercise the real API for deferred decisions that survive reload, reviewing a
secondary action, switching customers without deleting the previous session, moving a trader's
clock, and avoiding double counting a deposit in net position. Fresh sessions for the same
customer cannot inherit decisions, including when the record request fails. An offline switch
also checks that the chosen customer's simulation replaces the previous customer's and cannot
record decisions. The source-label check replaces only the view's provenance metadata to
exercise synthetic sandbox replay copy. CI installs Chromium with its system dependencies and
runs this suite after build.

These are Chromium mobile-viewport checks. They do not establish physical iPhone safe-area or
Safari behavior; that remains a device verification step.
