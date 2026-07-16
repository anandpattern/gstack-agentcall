import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

/**
 * This config existed as a gap once: with NO eslint config in the project,
 * `next build`'s "Linting" step was a silent no-op, so a react-hooks/
 * rules-of-hooks violation (useSticky after an early return) shipped to prod
 * and white-screened the dashboard (React #310, 2026-07-17). next/core-web-
 * vitals makes rules-of-hooks a build-failing ERROR. Don't remove this file.
 */
const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

const eslintConfig = [
  // Generated / build output — not ours to lint.
  { ignores: [".next/**", "out/**", "node_modules/**", "next-env.d.ts"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Cosmetic-only: literal ' and " in JSX copy render fine; escaping them
      // makes prose unreadable in source. The dangerous rules (rules-of-hooks
      // etc.) stay at their core-web-vitals ERROR level.
      "react/no-unescaped-entities": "off",
      // Underscore-prefixed args are the intentional-ignore convention
      // (used by the dev-auth stubs).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];

export default eslintConfig;
