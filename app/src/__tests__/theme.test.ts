import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyTheme, getInitialTheme, persistTheme, THEME_STORAGE_KEY, toggleTheme } from '@/lib/theme'

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial))
  return {
    get length() {
      return values.size
    },
    clear() {
      values.clear()
    },
    getItem(key: string) {
      return values.get(key) ?? null
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null
    },
    removeItem(key: string) {
      values.delete(key)
    },
    setItem(key: string, value: string) {
      values.set(key, value)
    },
  }
}

describe('theme mode utilities', () => {
  it('keeps dark as the default when no valid preference is stored', () => {
    expect(getInitialTheme(memoryStorage())).toBe('dark')
    expect(getInitialTheme(memoryStorage({ [THEME_STORAGE_KEY]: 'sepia' }))).toBe('dark')
  })

  it('reads and persists light or dark preferences', () => {
    const storage = memoryStorage({ [THEME_STORAGE_KEY]: 'light' })

    expect(getInitialTheme(storage)).toBe('light')

    persistTheme('dark', storage)

    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('dark')
  })

  it('applies the theme to the document root', () => {
    const root = document.createElement('html')

    applyTheme('light', root)

    expect(root.dataset.theme).toBe('light')
    expect(root.style.colorScheme).toBe('light')
  })

  it('toggles between light and dark modes', () => {
    expect(toggleTheme('dark')).toBe('light')
    expect(toggleTheme('light')).toBe('dark')
  })
})

describe('theme shell wiring', () => {
  it('initializes theme before React renders and exposes the sidebar toggle', () => {
    const mainSource = readFileSync(resolve(__dirname, '../main.tsx'), 'utf8')
    const sidebarSource = readFileSync(resolve(__dirname, '../components/layout/Sidebar.tsx'), 'utf8')
    const tailwindSource = readFileSync(resolve(__dirname, '../../tailwind.config.js'), 'utf8')
    const htmlSource = readFileSync(resolve(__dirname, '../../index.html'), 'utf8')

    expect(mainSource).toContain('initializeTheme()')
    expect(mainSource).toContain('<ThemeProvider>')
    expect(sidebarSource).toContain('useTheme')
    expect(sidebarSource).toContain('Sun')
    expect(sidebarSource).toContain('Moon')
    expect(tailwindSource).toContain('rgb(var(--color-bg) / <alpha-value>)')
    expect(htmlSource).toContain(THEME_STORAGE_KEY)
    expect(htmlSource).toContain('document.documentElement.dataset.theme')
  })
})
