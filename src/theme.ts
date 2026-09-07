/** Dark/Light-Modus — ohne Settings-Datei, persistiert in localStorage. */
export type Theme = 'dark' | 'light';

const KEY = 'theme';

export function readStoredTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* Speicher nicht verfügbar — Modus gilt dann nur für diese Sitzung */
  }
}
