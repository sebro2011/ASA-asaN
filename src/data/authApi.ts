/**
 * Authentication calls and error translation.
 *
 * Every function returns a discriminated union so the UI never has to inspect
 * Supabase's error strings, and never receives a raw error object (which can
 * carry tokens or request URLs into logs).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type AuthErrorCode =
  | 'invalid-credentials'
  | 'email-not-confirmed'
  | 'email-taken'
  | 'weak-password'
  | 'rate-limited'
  | 'invalid-email'
  | 'same-password'
  | 'session-missing'
  | 'network'
  | 'unknown';

export type AuthFailure = { ok: false; code: AuthErrorCode };
export type AuthSuccess<T = undefined> = T extends undefined ? { ok: true } : { ok: true; value: T };
export type AuthResult<T = undefined> = AuthSuccess<T> | AuthFailure;

const PATTERNS: Array<[RegExp, AuthErrorCode]> = [
  [/invalid login credentials/i, 'invalid-credentials'],
  [/email not confirmed/i, 'email-not-confirmed'],
  [/user already registered|already registered|user already exists/i, 'email-taken'],
  [/password should be at least|password.*(too short|weak)/i, 'weak-password'],
  [/rate limit|too many requests|over_email_send_rate_limit/i, 'rate-limited'],
  [/unable to validate email|invalid email|email address .* is invalid/i, 'invalid-email'],
  [/should be different from the old password|same password/i, 'same-password'],
  [/auth session missing|not authenticated/i, 'session-missing'],
  [/fetch|network|failed to fetch|load failed|timeout/i, 'network'],
];

/** Map a Supabase/GoTrue error to a stable code. Never returns the message. */
export function mapAuthError(error: unknown): AuthErrorCode {
  const message =
    typeof error === 'string'
      ? error
      : (error as { message?: string } | null)?.message ?? '';
  for (const [pattern, code] of PATTERNS) {
    if (pattern.test(message)) return code;
  }
  return 'unknown';
}

export interface SignInInput {
  email: string;
  password: string;
}

export interface SignUpInput {
  email: string;
  password: string;
  locale?: 'en' | 'si' | 'ta';
  redirectTo?: string;
}

/** Trim + basic shape check before any network call. */
export function normaliseEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function validateCredentials(email: string, password: string): AuthErrorCode | null {
  const normalised = normaliseEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalised)) return 'invalid-email';
  if (password.length < 8) return 'weak-password';
  return null;
}

export async function signIn(
  client: SupabaseClient,
  { email, password }: SignInInput,
): Promise<AuthResult> {
  const invalid = validateCredentials(email, password);
  if (invalid) return { ok: false, code: invalid };
  try {
    const { error } = await client.auth.signInWithPassword({
      email: normaliseEmail(email),
      password,
    });
    if (error) return { ok: false, code: mapAuthError(error) };
    return { ok: true };
  } catch (error) {
    return { ok: false, code: mapAuthError(error) };
  }
}

/**
 * Sign up. `needsConfirmation` is true when Supabase returns a user but no
 * session, which is exactly what happens while email confirmation is required.
 */
export async function signUp(
  client: SupabaseClient,
  { email, password, locale, redirectTo }: SignUpInput,
): Promise<AuthResult<{ needsConfirmation: boolean }>> {
  const invalid = validateCredentials(email, password);
  if (invalid) return { ok: false, code: invalid };
  try {
    const { data, error } = await client.auth.signUp({
      email: normaliseEmail(email),
      password,
      options: {
        emailRedirectTo: redirectTo,
        data: locale ? { locale } : undefined,
      },
    });
    if (error) return { ok: false, code: mapAuthError(error) };
    return { ok: true, value: { needsConfirmation: !data.session } };
  } catch (error) {
    return { ok: false, code: mapAuthError(error) };
  }
}

export async function signOut(client: SupabaseClient): Promise<AuthResult> {
  try {
    const { error } = await client.auth.signOut();
    if (error) return { ok: false, code: mapAuthError(error) };
    return { ok: true };
  } catch (error) {
    return { ok: false, code: mapAuthError(error) };
  }
}

export async function sendPasswordReset(
  client: SupabaseClient,
  email: string,
  redirectTo?: string,
): Promise<AuthResult> {
  const normalised = normaliseEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalised)) return { ok: false, code: 'invalid-email' };
  try {
    const { error } = await client.auth.resetPasswordForEmail(normalised, { redirectTo });
    if (error) return { ok: false, code: mapAuthError(error) };
    return { ok: true };
  } catch (error) {
    return { ok: false, code: mapAuthError(error) };
  }
}

export async function updatePassword(
  client: SupabaseClient,
  password: string,
): Promise<AuthResult> {
  if (password.length < 8) return { ok: false, code: 'weak-password' };
  try {
    const { error } = await client.auth.updateUser({ password });
    if (error) return { ok: false, code: mapAuthError(error) };
    return { ok: true };
  } catch (error) {
    return { ok: false, code: mapAuthError(error) };
  }
}

export async function resendConfirmation(
  client: SupabaseClient,
  email: string,
  redirectTo?: string,
): Promise<AuthResult> {
  try {
    const { error } = await client.auth.resend({
      type: 'signup',
      email: normaliseEmail(email),
      options: { emailRedirectTo: redirectTo },
    });
    if (error) return { ok: false, code: mapAuthError(error) };
    return { ok: true };
  } catch (error) {
    return { ok: false, code: mapAuthError(error) };
  }
}

/** Where Supabase should send a user after confirming / resetting. */
export function authRedirectUrl(path = '/profile'): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return new URL(path, window.location.origin).toString();
  } catch {
    return undefined;
  }
}
