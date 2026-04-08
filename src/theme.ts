export type ResolvedTheme = 'light' | 'dark'
export type ThemeMode = ResolvedTheme | 'system'

export const THEME_STORAGE_KEY = 'pencil-free-note:theme'

export const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

export const isThemeMode = (value: unknown): value is ThemeMode =>
  typeof value === 'string' && ['light', 'dark', 'system'].includes(value)

export const getSystemTheme = (): ResolvedTheme => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export const loadThemeMode = (): ThemeMode => {
  if (typeof localStorage === 'undefined') return 'system'

  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return isThemeMode(stored) ? stored : 'system'
  } catch {
    return 'system'
  }
}

export const resolveTheme = (mode: ThemeMode, systemTheme: ResolvedTheme): ResolvedTheme =>
  mode === 'system' ? systemTheme : mode

export const applyTheme = (mode: ThemeMode, systemTheme = getSystemTheme()) => {
  if (typeof document === 'undefined') return resolveTheme(mode, systemTheme)

  const resolved = resolveTheme(mode, systemTheme)
  const root = document.documentElement
  root.dataset.theme = resolved
  root.dataset.themeMode = mode
  root.style.colorScheme = resolved
  return resolved
}
