export interface ThemeVars {
  bg: string
  surface: string
  border: string
  text: string
  textMuted: string
  accent: string
}

export interface ThemePreset {
  id: string
  label: string
  mode: 'light' | 'dark'
  vars: ThemeVars
}

export const THEMES: ThemePreset[] = [
  {
    id: 'light',
    label: 'Light',
    mode: 'light',
    vars: {
      bg: '#ffffff', surface: '#f6f8fa', border: '#d0d7de',
      text: '#1f2328', textMuted: '#656d76', accent: '#0969da',
    },
  },
  {
    id: 'dark',
    label: 'Dark',
    mode: 'dark',
    vars: {
      bg: '#0d1117', surface: '#161b22', border: '#30363d',
      text: '#e6edf3', textMuted: '#7d8590', accent: '#58a6ff',
    },
  },
  {
    id: 'solarized-light',
    label: 'Solarized Light',
    mode: 'light',
    vars: {
      bg: '#fdf6e3', surface: '#eee8d5', border: '#d3cbb7',
      text: '#586e75', textMuted: '#93a1a1', accent: '#268bd2',
    },
  },
  {
    id: 'solarized-dark',
    label: 'Solarized Dark',
    mode: 'dark',
    vars: {
      bg: '#002b36', surface: '#073642', border: '#0a4a58',
      text: '#eee8d5', textMuted: '#93a1a1', accent: '#2aa198',
    },
  },
  {
    id: 'dracula',
    label: 'Dracula',
    mode: 'dark',
    vars: {
      bg: '#282a36', surface: '#21222c', border: '#44475a',
      text: '#f8f8f2', textMuted: '#9ea1c4', accent: '#bd93f9',
    },
  },
  {
    id: 'nord',
    label: 'Nord',
    mode: 'dark',
    vars: {
      bg: '#2e3440', surface: '#3b4252', border: '#4c566a',
      text: '#eceff4', textMuted: '#9ba3b4', accent: '#88c0d0',
    },
  },
  {
    id: 'monokai',
    label: 'Monokai',
    mode: 'dark',
    vars: {
      bg: '#272822', surface: '#1e1f1c', border: '#49483e',
      text: '#f8f8f2', textMuted: '#a59f85', accent: '#a6e22e',
    },
  },
  {
    id: 'rose-pine',
    label: 'Rosé Pine',
    mode: 'dark',
    vars: {
      bg: '#191724', surface: '#1f1d2e', border: '#403d52',
      text: '#e0def4', textMuted: '#908caa', accent: '#eb6f92',
    },
  },
  {
    id: 'tarn',
    label: 'Tarn',
    mode: 'dark',
    vars: {
      bg: '#1e293b', surface: '#232e3d', border: '#4a5568',
      text: '#e2e8f0', textMuted: '#8591a4', accent: '#67b8e3',
    },
  },
  {
    id: 'tarn-light',
    label: 'Tarn Light',
    mode: 'light',
    vars: {
      bg: '#f8fafc', surface: '#f1f5f9', border: '#cbd5e1',
      text: '#0f172a', textMuted: '#64748b', accent: '#0369a1',
    },
  },
]

export function getTheme(id: string): ThemePreset {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}

const VAR_KEYS: Record<keyof ThemeVars, string> = {
  bg: '--bg',
  surface: '--surface',
  border: '--border',
  text: '--text',
  textMuted: '--text-muted',
  accent: '--accent',
}

export function applyTheme(preset: ThemePreset): void {
  const root = document.documentElement
  root.setAttribute('data-theme', preset.id)
  root.setAttribute('data-theme-mode', preset.mode)
  root.style.colorScheme = preset.mode
  for (const key of Object.keys(VAR_KEYS) as (keyof ThemeVars)[]) {
    root.style.setProperty(VAR_KEYS[key], preset.vars[key])
  }
}
