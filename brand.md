# HBAR Invoices brand

Palette: Vault Blue. Category: tooling/dev. Mood: calm and premium. Selected October 4, 2026.

Typography: Inter for headings and body, JetBrains Mono for code and identifiers. Typography selection was skipped, applying the skill's default pair. Latin variable fonts are self-hosted through next/font/local from Fontsource 5.3.0, with OFL notices in packages/nextjs/fonts. This avoids a Google Fonts network dependency during clean builds.

Use one restrained blue accent, generous whitespace, flat borders and clear configuration states. Write direct, factual guidance for developers. Distinguish configuration from a verified deployment or payment. Gradients were skipped by user preference.

## Theme tokens

The app's globals.css is the runtime source of truth. Both light and dark palettes passed the 13 contrast pairs from the brand-design skill; dark tokens are available through the `.dark` class.

| Token                  | Light                   | Dark                    |
| ---------------------- | ----------------------- | ----------------------- |
| background             | `oklch(0.98 0.005 225)` | `oklch(0.14 0.01 225)`  |
| foreground             | `oklch(0.2 0.015 225)`  | `oklch(0.96 0.01 225)`  |
| card                   | `oklch(1 0 0)`          | `oklch(0.2 0.015 225)`  |
| card-foreground        | `oklch(0.2 0.015 225)`  | `oklch(0.96 0.01 225)`  |
| popover                | `oklch(1 0 0)`          | `oklch(0.2 0.015 225)`  |
| popover-foreground     | `oklch(0.2 0.015 225)`  | `oklch(0.96 0.01 225)`  |
| primary                | `oklch(0.45 0.13 225)`  | `oklch(0.74 0.13 225)`  |
| primary-foreground     | `oklch(0.99 0 0)`       | `oklch(0.14 0.01 225)`  |
| secondary              | `oklch(0.94 0.01 225)`  | `oklch(0.26 0.015 225)` |
| secondary-foreground   | `oklch(0.2 0.015 225)`  | `oklch(0.96 0.01 225)`  |
| muted                  | `oklch(0.94 0.01 225)`  | `oklch(0.26 0.015 225)` |
| muted-foreground       | `oklch(0.43 0.015 225)` | `oklch(0.76 0.015 225)` |
| accent                 | `oklch(0.94 0.01 225)`  | `oklch(0.26 0.015 225)` |
| accent-foreground      | `oklch(0.2 0.015 225)`  | `oklch(0.96 0.01 225)`  |
| destructive            | `oklch(0.43 0.15 25)`   | `oklch(0.75 0.14 25)`   |
| destructive-foreground | `oklch(0.99 0 0)`       | `oklch(0.14 0 0)`       |
| border                 | `oklch(0.78 0.01 225)`  | `oklch(0.39 0.015 225)` |
| input                  | `oklch(0.78 0.01 225)`  | `oklch(0.39 0.015 225)` |
| ring                   | `oklch(0.45 0.13 225)`  | `oklch(0.74 0.13 225)`  |
