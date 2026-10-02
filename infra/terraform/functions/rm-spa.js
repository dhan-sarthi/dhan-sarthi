// CloudFront viewer-request function for the RM console under /rm/ (cloudfront-js-2.0).
//
// The console is a single-page app: /rm/customers/<cif>/journey is a route in the browser, not a
// key in the bucket. Without this, S3 answers 403 for it and the distribution-wide error page
// serves /index.html, which is the mobile app's shell. A path whose last segment has no file
// extension is therefore rewritten to the console's own shell; anything with an extension
// (hashed assets, the favicon) is fetched as it is.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- CloudFront calls `handler` by name
function handler(event) {
  const request = event.request
  const uri = request.uri

  if (uri === '/rm') {
    return {
      statusCode: 302,
      statusDescription: 'Found',
      headers: { location: { value: '/rm/' } },
    }
  }

  const last = uri.substring(uri.lastIndexOf('/') + 1)
  if (last.indexOf('.') === -1) {
    request.uri = '/rm/index.html'
  }
  return request
}
