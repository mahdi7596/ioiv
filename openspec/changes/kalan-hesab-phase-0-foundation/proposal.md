## Why

The Kalan Hesab project is a second client built on the IOIV Next.js codebase. All `/kalan-hesab/*` routes must render with a gold palette (`#C89820`) instead of IOIV's slate/orange palette. The foundation phase wires this gold identity into the codebase so every existing component class (`.button--primary`, `.auth-panel`, `.panel`, `.data-table`, etc.) automatically picks up gold when rendered inside the Kalan Hesab subtree — with zero per-component edits and zero risk to IOIV routes.

## What Changes

- Add `app/kalan-hesab/kalan-hesab.css`: a single CSS file that overrides seven `--color-*` design tokens inside a `.kalan-hesab-theme` scope class.
- Add `app/kalan-hesab/layout.tsx`: a Next.js nested layout that imports the gold CSS and wraps all children in `<div className="kalan-hesab-theme">`.
- `public/kalan-hesab-logo.jpeg` is already present on the branch — no action needed.
- No existing files are modified. IOIV routes are fully isolated.

## Capabilities

### New Capabilities
- `kalan-hesab-gold-theme`: Scoped CSS variable overrides that apply the gold palette to all `/kalan-hesab/*` routes via a nested layout wrapper, with zero effect on IOIV routes.

### Modified Capabilities
- None.

## Impact

- `app/kalan-hesab/layout.tsx` — new file
- `app/kalan-hesab/kalan-hesab.css` — new file
- No existing files touched.
