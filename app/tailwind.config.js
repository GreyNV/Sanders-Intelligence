/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:       '#0f1117',
        surface:  '#1a1d27',
        surface2: '#22263a',
        border:   '#2e3250',
        text1:    '#e8eaf6',
        text2:    '#8890b5',
        accent:   '#6c8aff',
        success:  '#4caf87',
        warning:  '#f5a623',
        danger:   '#e05c7a',
        orange:   '#ff8c5a',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
