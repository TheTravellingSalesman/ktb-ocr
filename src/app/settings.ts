/**
 * App settings, kept in this browser.
 *
 * Settings are per-computer conveniences. Losing them only means entering the
 * category store address again.
 */

/**
 * Attributes
 * ----------
 * storeUrl : str
 *     Address of the category store's web app. Empty means no shared store,
 *     so Other items become provisional categories.
 * readDigits : bool
 *     Whether digit recognition runs. Off, inked boxes are left for staff to type.
 * readText : bool
 *     Whether handwriting recognition runs.
 */
export interface Settings {
  storeUrl: string;
  readDigits: boolean;
  readText: boolean;
}

const KEY = "ktb-settings";
export const DEFAULT_SETTINGS: Settings = { storeUrl: "", readDigits: true, readText: true };

export function loadSettings(): Settings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage can be unavailable in private windows. Settings then last for this visit only
  }
}
