/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Ahora Tailwind "leerá" tus variables de index.css
        primary: "var(--primary)",
        "bg-light": "var(--bg-light)",
        "bg-dark": "var(--bg-dark)",
        "text-main": "var(--text-light)",
        "card-bg": "var(--card-light)",
      },
      borderRadius: {
        '3xl': '2rem',
        '4xl': '3rem',
      }
    },
  },
  plugins: [],
};