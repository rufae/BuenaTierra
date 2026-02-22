/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['"DM Sans"', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        // Terracota principal — extraido de la banda superior de las etiquetas
        brand: {
          50:  '#fdf5ed',
          100: '#fae6cc',
          200: '#f5c994',
          300: '#efa659',
          400: '#e8852d',
          500: '#c4541a',  // ← color principal de marca
          600: '#a84115',
          700: '#8b3213',
          800: '#6e2610',
          900: '#501a09',
          950: '#2c0e04',
        },
        // Crema — fondo cálido de las etiquetas
        cream: {
          50:  '#fefcf7',
          100: '#fdf8ee',
          200: '#faefd8',
          300: '#f5e1b8',
          400: '#eccc89',
          500: '#e0b355',
        },
        // Tierra — marrones profundos para tipografía y fondos oscuros
        earth: {
          50:  '#f5f0e8',
          100: '#e8dcc8',
          200: '#d4c0a0',
          300: '#b89b74',
          400: '#9a7a52',
          500: '#7a5c36',
          600: '#5e431e',
          700: '#3f2b0c',
          800: '#2c1c06',
          900: '#1a0f04',
        },
        // Trigo — dorado de los campos
        wheat: {
          300: '#f0c956',
          400: '#e8b32a',
          500: '#d4a044',
          600: '#b8853a',
        },
        // Salvia — verde natural de los campos
        sage: {
          300: '#91b88a',
          400: '#72a369',
          500: '#5a8a52',
          600: '#447040',
        },
      },
      boxShadow: {
        'warm-sm': '0 1px 3px 0 rgba(196,84,26,0.08), 0 1px 2px -1px rgba(196,84,26,0.06)',
        'warm':    '0 4px 16px -2px rgba(196,84,26,0.12), 0 2px 6px -2px rgba(196,84,26,0.08)',
        'warm-lg': '0 12px 32px -4px rgba(196,84,26,0.18), 0 4px 12px -4px rgba(196,84,26,0.12)',
      },
      animation: {
        'float-slow':   'floatSlow 7s ease-in-out infinite',
        'float-medium': 'floatMedium 5s ease-in-out infinite',
        'float-fast':   'floatFast 3.5s ease-in-out infinite',
      },
      keyframes: {
        floatSlow: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-14px)' },
        },
        floatMedium: {
          '0%, 100%': { transform: 'translateY(0px) rotate(-1deg)' },
          '50%': { transform: 'translateY(-8px) rotate(1.5deg)' },
        },
        floatFast: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-5px)' },
        },
      },
    },
  },
  plugins: [],
}

