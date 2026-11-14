/**
 * The CosmoVision feed's two timing numbers, in one place so they can be checked
 * against the server rather than trusted.
 *
 * One page of the feed costs the server at most one YouTube `search.list` plus one
 * `videos.list`, each capped at 7 s, so a cold instance can spend ~14 s before it
 * answers. The browser used to give up at 20 s with no second attempt, which is
 * how a temporary upstream stall became a permanent "Videos could not be loaded"
 * panel. The same failure now gets one silent retry.
 */
import { TRANSIENT_RETRY, type RetryPolicy } from '../../lib/retry';

/** Comfortably above the server's 14 s worst case, and finite so it still ends. */
export const FEED_REQUEST_TIMEOUT_MS = 20_000;

/** Retry policy for the first page only; later pages keep their token semantics. */
export const FEED_RETRY: RetryPolicy = TRANSIENT_RETRY;
