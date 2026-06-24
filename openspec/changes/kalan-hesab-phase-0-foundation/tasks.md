## 1. CSS Theme File

- [x] 1.1 Create `app/kalan-hesab/kalan-hesab.css` with the `.kalan-hesab-theme` rule overriding the seven gold palette tokens: `--color-primary: #C89820`, `--color-on-primary: #ffffff`, `--color-secondary: #A67A10`, `--color-on-secondary: #ffffff`, `--color-background: #fdfbf6`, `--color-surface-muted: #faf7ee`, `--color-border: #ead9a0`.

## 2. Nested Layout

- [x] 2.1 Create `app/kalan-hesab/layout.tsx` that imports `./kalan-hesab.css` and returns `<div className="kalan-hesab-theme">{children}</div>`. Accept a `children: React.ReactNode` prop. No other markup, no metadata export.
