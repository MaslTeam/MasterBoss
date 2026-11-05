/** @type {import('tailwindcss').Config} */
// Палитра дизайна v2: чёрный, жёлтый, белый + серебро и тёплые нейтральные
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: '#121212',
        ink2: '#2A2A28',
        ink3: '#3A3A38',
        sun: '#FFC531',
        sunsoft: '#FFF4D1',
        sunpale: '#FFE08A',
        sundeep: '#6B4E00',
        cream: '#F7F6F2',
        mist: '#F5F4F0',
        sand: '#ECEAE4',
        silver: '#C4C7CC',
        silverlight: '#ECEDEF',
        silverline: '#D5D7DA',
        graphite: '#6E7177',
        muted: '#6B6862',
        body: '#4A4843',
        onink: '#C9C6BE',
        nude: '#F4E6DA',
        danger: '#B3261E',
      },
      fontFamily: {
        sans: ['Manrope', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Unbounded', 'Manrope', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
