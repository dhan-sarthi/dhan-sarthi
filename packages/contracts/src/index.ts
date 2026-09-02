/**
 * The API contract, defined once.
 *
 * The API validates requests and responses against these schemas; web and mobile import the
 * inferred types. This is the whole reason a second client is cheap — without it, a mobile app
 * is a second guess at what the server returns.
 *
 * Rule: a route may not return a shape that is not declared here.
 */
export {}
