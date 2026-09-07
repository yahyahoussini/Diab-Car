import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Playwright's generated HTML report bundles minified React — linting it
    // produced hundreds of rules-of-hooks errors from code we do not own and
    // buried the handful that are actually ours.
    "playwright-report/**",
    "test-results/**",
    ".lighthouse/**",
  ]),
]);

export default eslintConfig;
