/**
 * How many proxies to trust in front of the app (audit M3).
 *
 * `app.set('trust proxy', …)` was never called, so `req.ip` was always the
 * address of whatever connected to the process. In production that is the
 * platform's proxy, not the visitor — which means every per-IP rate limit (NOVA
 * chat, translation, community writes) collapsed into a **single shared bucket
 * for the entire deployment**. That is worse than having no limit: one busy
 * client throttles everyone, and one abusive client is invisible.
 *
 * Trusting too much is the other failure: with `trust proxy: true`, Express takes
 * the left-most `X-Forwarded-For` entry, which any client can forge — the limit
 * becomes bypassable by sending a different header each time.
 *
 * So the number matters, and it has to be a deployment fact. The default is **1**
 * (one platform proxy hop), which is what Vercel and Cloud Run put in front of
 * this app. `TRUST_PROXY` overrides it; `TRUST_PROXY=0` disables trusting
 * entirely for a directly exposed deployment.
 */

export type TrustProxyValue = number | false | string[];

export interface ParsedTrustProxy {
  value: TrustProxyValue;
  /** Set when the input was unusable and the default was applied. */
  warning?: string;
  /** How the value was decided, for the startup log. */
  source: 'default' | 'config';
}

const DEFAULT_HOPS = 1;

export function parseTrustProxy(raw: string | undefined | null): ParsedTrustProxy {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed) {
    return { value: DEFAULT_HOPS, source: 'default' };
  }

  const lowered = trimmed.toLowerCase();
  if (lowered === 'false' || lowered === 'none') {
    return { value: false, source: 'config' };
  }
  if (lowered === 'true' || lowered === '*' || lowered === 'all') {
    // Refused on purpose: trusting every hop makes `req.ip` attacker-controlled.
    return {
      value: DEFAULT_HOPS,
      source: 'config',
      warning: 'TRUST_PROXY=true trusts every hop, which lets a client forge its own IP; using 1 instead.',
    };
  }

  if (/^\d+$/.test(trimmed)) {
    const hops = Number(trimmed);
    if (hops === 0) return { value: false, source: 'config' };
    if (hops > 10) {
      return {
        value: DEFAULT_HOPS,
        source: 'config',
        warning: `TRUST_PROXY=${hops} is implausible for a single deployment; using ${DEFAULT_HOPS} instead.`,
      };
    }
    return { value: hops, source: 'config' };
  }

  // Express accepts a list such as 'loopback', 'linklocal', 'uniquelocal' or
  // CIDR blocks. Pass them through as an array rather than leaving Express to
  // re-parse a comma string.
  const named = trimmed.split(',').map((entry) => entry.trim()).filter(Boolean);
  const valid = named.every((entry) => /^(loopback|linklocal|uniquelocal)$/i.test(entry) || /^[0-9a-f:./]+$/i.test(entry));
  if (valid) {
    return { value: named, source: 'config' };
  }

  return {
    value: DEFAULT_HOPS,
    source: 'config',
    warning: `TRUST_PROXY="${trimmed}" is not a hop count, a CIDR block or a known keyword; using ${DEFAULT_HOPS} instead.`,
  };
}
