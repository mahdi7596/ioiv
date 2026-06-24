# kalan-hesab-gold-theme

## Behaviour

- All routes under `/kalan-hesab/*` render with the gold palette defined below.
- No IOIV route (outside `/kalan-hesab/`) is affected by the gold palette.
- The gold palette is applied by overriding CSS custom properties inside the `.kalan-hesab-theme` scope class.

## Token Overrides

| Token | Value |
|-------|-------|
| `--color-primary` | `#C89820` |
| `--color-on-primary` | `#ffffff` |
| `--color-secondary` | `#A67A10` |
| `--color-on-secondary` | `#ffffff` |
| `--color-background` | `#fdfbf6` |
| `--color-surface-muted` | `#faf7ee` |
| `--color-border` | `#ead9a0` |

## Files

- `app/kalan-hesab/kalan-hesab.css` — defines the `.kalan-hesab-theme` rule with the token overrides above.
- `app/kalan-hesab/layout.tsx` — imports `kalan-hesab.css` and wraps children in `<div className="kalan-hesab-theme">`.
