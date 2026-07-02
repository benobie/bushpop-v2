/**
 * Root page — proxy rewrites all requests to /[channel]/... so this
 * should never render in production. It exists as a fallback.
 */
export default function RootPage() {
  return null;
}
