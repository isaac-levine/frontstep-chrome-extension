/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./**/*.{ts,tsx}"],
  prefix: "plasmo-",
  theme: {
    extend: {
      colors: {
        orange: {
          500: "#FF6B00",
          600: "#E65D00"
        }
      }
    }
  },
  plugins: []
}
