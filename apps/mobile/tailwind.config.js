/** @type {import('tailwindcss').Config} */
module.exports = {
  // The app is light-only by design — the cream ground and the saturated surfaces
  // are the product. 'class' rather than the 'media' default so nothing tries to
  // follow the OS and flip a palette that has no dark counterpart.
  darkMode: 'class',
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [
    require('nativewind/preset'),
    require('@dhan/design/tailwind-preset'),
  ],
  theme: {},
  plugins: [],
}
