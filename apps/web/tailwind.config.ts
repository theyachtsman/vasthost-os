import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: 'hsl(var(--vh-bg) / <alpha-value>)',
        surface: 'hsl(var(--vh-surface) / <alpha-value>)',
        'surface-2': 'hsl(var(--vh-surface-2) / <alpha-value>)',
        border: 'hsl(var(--vh-border) / <alpha-value>)',
        fg: 'hsl(var(--vh-fg) / <alpha-value>)',
        muted: 'hsl(var(--vh-muted) / <alpha-value>)',
        accent: 'hsl(var(--vh-accent) / <alpha-value>)',
        'accent-fg': 'hsl(var(--vh-accent-fg) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
