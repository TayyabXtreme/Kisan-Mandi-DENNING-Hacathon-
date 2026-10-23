const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      "convex/_generated/**",
      ".docs-cache/**",
      "output/**",
      "dist/**",
    ],
  },
]);
