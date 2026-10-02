import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans Arabic"', '"Noto Kufi Arabic"', '"Segoe UI"', 'Tahoma', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: {
          bg: 'rgb(var(--c-bg) / <alpha-value>)',
          panel: 'rgb(var(--c-panel) / <alpha-value>)',
          line: 'rgb(var(--c-line) / <alpha-value>)',
          text: 'rgb(var(--c-text) / <alpha-value>)',
          muted: 'rgb(var(--c-muted) / <alpha-value>)',
          accent: 'rgb(var(--c-accent) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
