## Theme Scoping Strategy

The IOIV `globals.css` declares all design tokens on `:root`. Every component class already consumes these tokens via `var(--color-primary)`, `var(--color-border)`, etc. Overriding the same variable names inside a scoped class (`.kalan-hesab-theme`) makes all descendant elements inherit the new values without any component changes — this is standard CSS cascade behaviour.

## Gold Palette

```css
.kalan-hesab-theme {
  --color-primary: #C89820;
  --color-on-primary: #ffffff;
  --color-secondary: #A67A10;
  --color-on-secondary: #ffffff;
  --color-background: #fdfbf6;
  --color-surface-muted: #faf7ee;
  --color-border: #ead9a0;
}
```

Only the tokens that differ from IOIV are overridden. Tokens not listed here (e.g. `--color-text`, `--color-danger`, `--color-success`) inherit from `:root` unchanged.

## Nested Layout

Next.js nested layouts compose without re-rendering the root shell. The root `app/layout.tsx` provides `<html lang="fa" dir="rtl">`, the IRANYekan font variable, and `<ToastProvider />`. The `app/kalan-hesab/layout.tsx` only adds the theme wrapper `<div>`:

```tsx
import "./kalan-hesab.css";

export default function KalanHesabLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="kalan-hesab-theme">{children}</div>;
}
```

## Isolation

The `.kalan-hesab-theme` class exists only inside `app/kalan-hesab/layout.tsx`. No IOIV route renders this wrapper. The CSS import is scoped to the nested layout file, so the override rule is never even parsed for IOIV pages.
