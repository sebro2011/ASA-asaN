/**
 * Canonical application version source.
 *
 * Every surface that displays a version (welcome screen, footer, tests)
 * imports from this module so the number can never drift between components.
 * The raw value lives in package.json — the repository's existing version
 * field — and this module is the only code path that reads it.
 *
 * Release status is honest: there is no verified stable-release process or
 * release tags in this repository, so the channel is `preview`. The word
 * "stable" must never be shown to users unless a verified release exists.
 */

import pkg from '../../package.json';

export type ReleaseChannel = 'preview' | 'beta' | 'stable';

/** SemVer string from package.json, e.g. `0.1.0`. */
export const APP_VERSION: string = pkg.version;

/**
 * Current release channel. `preview` because no tagged, verified stable
 * release exists yet. Bump to `stable` only via an explicit release process.
 */
export const RELEASE_CHANNEL: ReleaseChannel = 'preview';

/** True only for a verified stable release; today this is always false. */
export function isStableRelease(): boolean {
  return RELEASE_CHANNEL === 'stable';
}

/**
 * Single human-readable label used by every UI surface, e.g.
 * `v0.1.0 · preview`. Kept free of build metadata, commit hashes and
 * deployment identifiers — none of which are user-facing information.
 */
export function formatVersionLabel(version: string = APP_VERSION, channel: ReleaseChannel = RELEASE_CHANNEL): string {
  return `v${version} · ${channel}`;
}

/** Pre-formatted label for direct rendering. */
export const APP_VERSION_LABEL: string = formatVersionLabel();
