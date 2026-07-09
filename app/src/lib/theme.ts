export type ThemeMode = 'dark' | 'light'

export const THEME_STORAGE_KEY = 'ui.theme'
export const DEFAULT_THEME: ThemeMode = 'dark'

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'dark' || value === 'light'
}

export function getInitialTheme(storage = browserStorage()): ThemeMode {
  try {
    const stored = storage?.getItem(THEME_STORAGE_KEY)
    return isThemeMode(stored) ? stored : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

export function persistTheme(theme: ThemeMode, storage = browserStorage()) {
  try {
    storage?.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Ignore storage failures; the in-memory theme still applies for this session.
  }
}

export function applyTheme(theme: ThemeMode, root = browserRoot()) {
  if (!root) return
  root.dataset.theme = theme
  root.style.colorScheme = theme
}

export function initializeTheme(storage = browserStorage(), root = browserRoot()): ThemeMode {
  const theme = getInitialTheme(storage)
  applyTheme(theme, root)
  return theme
}

export function toggleTheme(theme: ThemeMode): ThemeMode {
  return theme === 'dark' ? 'light' : 'dark'
}

function browserStorage(): Storage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

function browserRoot(): HTMLElement | undefined {
  return globalThis.document?.documentElement
}
