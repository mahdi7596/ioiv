export function smsRequestTimeoutMs() {
  const configured = Number(process.env.SMS_REQUEST_TIMEOUT_MS || 10000);
  return Number.isFinite(configured) ? Math.min(30000, Math.max(1000, configured)) : 10000;
}
