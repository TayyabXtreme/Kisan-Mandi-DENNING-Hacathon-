/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: Update this to include the paths to all files that contain Nativewind classes.
  content: ["./src/app/**/*.{js,jsx,ts,tsx}", "./src/components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      // Inter weights are separate families: use font-bold-inter, not font-bold.
      fontFamily: {
        sans: ["Inter_400Regular"],
        "medium-inter": ["Inter_500Medium"],
        "semibold-inter": ["Inter_600SemiBold"],
        "bold-inter": ["Inter_700Bold"],
        "extrabold-inter": ["Inter_800ExtraBold"],
      },
    },
  },
  plugins: [],
}