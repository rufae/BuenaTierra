/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fef7ee',
          100: '#fdecd7',
          200: '#fad5ae',
          300: '#f7b57b',
          400: '#f28c46',
          500: '#ef6c22',
          600: '#df5317',
          700: '#b93f15',
          800: '#933319',
          900: '#772d18',
          950: '#40140a',
        },
      },
    },
  },
  plugins: [],
}

