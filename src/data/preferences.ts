/**
 * Device ↔ profile preference mirroring.
 *
 * Direction is deliberate and one-way: **the device wins**. These values already
 * drive the UI (theme, motion, contrast, sidebar, language), so a sign-in must
 * never silently flip someone's screen to whatever another device wrote last.
 * We copy the current device state up to `profiles` so it survives a new device,
 * and only ever apply cloud values on a device that has no local preference yet.
 */
import type { ProfileRow } from './types';

export const THEME_KEY = 'nova_theme';
export const MOTION_KEY = 'nova_motion';
export const CONTRAST_KEY = 'nova_contrast';
export const SIDEBAR_KEY = 'nova_sidebar_collapsed';
export const LANGUAGE_KEY = 'i18nextLng';

export interface DevicePreferences {
  theme?: 'dark' | 'light' | 'system';
  reduce_motion?: boolean;
  high_contrast?: boolean;
  sidebar_collapsed?: boolean;
  locale?: 'en' | 'si' | 'ta';
}

export interface ReadableStorage {
  getItem(key: string): string | null;
}

export function readDevicePreferences(storage: ReadableStorage): DevicePreferences {
  const read = (key: string): string | null => {
    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  };

  const preferences: DevicePreferences = {};

  const theme = read(THEME_KEY);
  if (theme === 'dark' || theme === 'light' || theme === 'system') preferences.theme = theme;

  const motion = read(MOTION_KEY);
  if (motion === 'reduced') preferences.reduce_motion = true;
  else if (motion === 'full') preferences.reduce_motion = false;

  const contrast = read(CONTRAST_KEY);
  if (contrast === 'high') preferences.high_contrast = true;
  else if (contrast === 'normal') preferences.high_contrast = false;

  const sidebar = read(SIDEBAR_KEY);
  if (sidebar === 'true' || sidebar === 'false') preferences.sidebar_collapsed = sidebar === 'true';

  const language = (read(LANGUAGE_KEY) || '').slice(0, 2);
  if (language === 'en' || language === 'si' || language === 'ta') preferences.locale = language;

  return preferences;
}

/** Fields that differ between the device and the profile (empty when in sync). */
export function preferenceDiff(
  device: DevicePreferences,
  profile: ProfileRow | null,
): DevicePreferences {
  if (!profile) return device;
  const diff: DevicePreferences = {};
  if (device.theme !== undefined && device.theme !== profile.theme) diff.theme = device.theme;
  if (device.reduce_motion !== undefined && device.reduce_motion !== profile.reduce_motion) {
    diff.reduce_motion = device.reduce_motion;
  }
  if (device.high_contrast !== undefined && device.high_contrast !== profile.high_contrast) {
    diff.high_contrast = device.high_contrast;
  }
  if (device.sidebar_collapsed !== undefined && device.sidebar_collapsed !== profile.sidebar_collapsed) {
    diff.sidebar_collapsed = device.sidebar_collapsed;
  }
  if (device.locale !== undefined && device.locale !== profile.locale) diff.locale = device.locale;
  return diff;
}

/**
 * Apply cloud preferences only when this device has never stored one. Returns the
 * values that should be written to localStorage (empty when the device wins).
 */
export function cloudPreferencesForFreshDevice(
  device: DevicePreferences,
  profile: ProfileRow | null,
): DevicePreferences {
  if (!profile) return {};
  const result: DevicePreferences = {};
  if (device.theme === undefined) result.theme = profile.theme;
  if (device.locale === undefined) result.locale = profile.locale;
  return result;
}
