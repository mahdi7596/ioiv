// Test-process preload only: deny external I/O and route the real adapter to loopback.
const nativeFetch = globalThis.fetch;
const fixture = new URL(process.env.PHASE3_PROVIDER_URL);
if (process.env.PHASE1_ISOLATED_DB !== 'true' || fixture.hostname !== '127.0.0.1') throw new Error('unsafe provider fixture');
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url || String(input));
  if (url.hostname === 'sandbox.zarinpal.com') return nativeFetch(`${fixture.origin}${url.pathname}`, init);
  if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') throw new Error('external I/O blocked');
  return nativeFetch(input, init);
};
