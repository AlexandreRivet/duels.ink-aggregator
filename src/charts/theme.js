/**
 * Chart colours as concrete values: the PNG renderer (resvg) doesn't support CSS
 * variables. The blue ↔ red diverging pair was validated (colour blindness, contrast)
 * on both surfaces.
 */
export const themes = {
  light: {
    name: 'light',
    surface: '#fcfcfb',
    text: '#0b0b0b',
    text2: '#52514e',
    muted: '#898781',
    grid: '#e1e0d9',
    axis: '#c3c2b7',
    accent: '#2a78d6',
    positive: '#2a78d6',
    negative: '#e34948',
    neutral: '#898781',
    divergingMid: '#f0efec',
  },
  dark: {
    name: 'dark',
    surface: '#1a1a19',
    text: '#ffffff',
    text2: '#c3c2b7',
    muted: '#898781',
    grid: '#2c2c2a',
    axis: '#383835',
    accent: '#3987e5',
    positive: '#3987e5',
    negative: '#e66767',
    neutral: '#898781',
    divergingMid: '#383835',
  },
};

export const FONT_FAMILY = "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";
