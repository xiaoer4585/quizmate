import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

type Theme = 'dark' | 'light'

interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => Promise<void>
  toggleTheme: () => Promise<void>
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark')

  useEffect(() => {
    // Load theme from main process
    const loadTheme = async () => {
      try {
        const api = (window as any).electronAPI
        if (api) {
          const settings = await api.config.getClientSettings()
          if (settings.theme) {
            setThemeState(settings.theme as Theme)
          }
        }
      } catch {}
    }
    loadTheme()

    // Listen for theme changes from main
    const api = (window as any).electronAPI
    let unsubscribe: (() => void) | undefined
    if (api) {
      unsubscribe = api.on('client-theme-changed', (newTheme: Theme) => {
        setThemeState(newTheme)
      })
    }
    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [])

  useEffect(() => {
    document.documentElement.classList.remove('theme-dark', 'theme-light')
    document.documentElement.classList.add(`theme-${theme}`)
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [theme])

  const setTheme = async (newTheme: Theme) => {
    setThemeState(newTheme)
    try {
      const api = (window as any).electronAPI
      if (api) {
        await api.window.setTheme(newTheme)
      }
    } catch {}
  }

  const toggleTheme = async () => {
    await setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
