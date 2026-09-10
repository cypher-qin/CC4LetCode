// A browser's Sec-Fetch-Site header cannot be set by page JavaScript.
// An opaque Origin alone is never enough to authorize a local request.
export function isTrustedOrigin(headers, port) {
  const allowed = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
  const origin = headers.origin;
  if (headers['sec-fetch-site'] === 'cross-site') return false;
  if (!origin) return true; // CLI clients and ordinary same-origin GETs.
  if (origin === 'null') return headers['sec-fetch-site'] === 'same-origin';
  // Some local Chrome setups strip the port from Origin. Accept that exact
  // loopback origin only when the browser independently certifies same-origin.
  if (headers['sec-fetch-site'] === 'same-origin' &&
      ['http://127.0.0.1','http://localhost'].includes(origin)) return true;
  return allowed.has(origin);
}
