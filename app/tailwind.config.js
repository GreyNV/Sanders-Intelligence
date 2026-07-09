/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:       'rgb(var(--color-bg) / <alpha-value>)',
        surface:  'rgb(var(--color-surface) / <alpha-value>)',
        surface2: 'rgb(var(--color-surface2) / <alpha-value>)',
        border:   'rgb(var(--color-border) / <alpha-value>)',
        text1:    'rgb(var(--color-text1) / <alpha-value>)',
        text2:    'rgb(var(--color-text2) / <alpha-value>)',
        accent:   'rgb(var(--color-accent) / <alpha-value>)',
        success:  'rgb(var(--color-success) / <alpha-value>)',
        warning:  'rgb(var(--color-warning) / <alpha-value>)',
        danger:   'rgb(var(--color-danger) / <alpha-value>)',
        orange:   'rgb(var(--color-orange) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
