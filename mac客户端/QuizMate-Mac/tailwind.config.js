/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#2563eb', dark: '#1d4ed8', light: '#dbeafe' },
        exam: { DEFAULT: '#7c3aed', dark: '#6d28d9', light: '#ede9fe' },
        accent: { DEFAULT: '#f59e0b', dark: '#d97706' },
      },
    },
  },
  plugins: [],
};
