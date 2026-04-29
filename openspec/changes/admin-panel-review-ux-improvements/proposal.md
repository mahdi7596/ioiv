## Why

Admins can currently view submission counts, filter the submissions table, inspect a submission, and download uploaded files, but the review experience still has avoidable friction. Overview count cards are informational only, search requires an explicit apply action, statuses do not visually communicate meaning, and the submission detail file list exposes raw field keys rather than telling the admin which document and selected year each uploaded file belongs to.

Improving these admin workflows will make review faster and reduce mistakes when matching uploaded documents to the fields users completed.

## What Changes

- Make admin overview metric cards clickable shortcuts into `/admin/submissions`, preserving the existing server-side URL filter behavior.
- Add instant search/filter UX for submissions while keeping the submissions page driven by query params and server-rendered data.
- Style application statuses with dedicated visual treatments for draft, pending payment, submitted, under review, needs edit, accepted, and rejected states.
- Style payment statuses with dedicated visual treatments for initiated, verified, failed, and missing-payment states.
- Replace the textual `مشاهده` table action with an icon action using `lucide-react`.
- Add `lucide-react` as the shared icon library for admin actions where icons improve scanability.
- Redesign submission detail uploads into categorized document groups so admins can see the source field, selected user year when available, filename, metadata, and a dedicated download action for every uploaded file.
- Preserve existing authorization, protected download routes, submission filtering semantics, and database schema.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `admin-review`: Improves overview navigation, submissions search/filter UX, status badges, payment badges, table row actions, and submission detail file categorization.
- `protected-files`: Improves admin-facing presentation of protected download links without changing file authorization or storage behavior.

## Impact

- Affected UI components and pages:
  - `app/admin/page.tsx`
  - `app/admin/submissions/page.tsx`
  - `app/admin/submissions/[id]/page.tsx`
  - `components/admin/SubmissionsTable.tsx`
  - `components/admin/StatusBadge.tsx`
  - new or updated admin badge/filter/file-list components as needed
  - `app/globals.css`
- Affected dependencies:
  - Add `lucide-react`
- Expected behavior changes:
  - Overview cards become navigable filter entry points.
  - Search/filter inputs update the submissions list with less manual friction.
  - Admins see meaningful status and payment badge colors.
  - Admins use an icon button to open details.
  - Admins see uploaded files grouped by document purpose and selected year.
- No Prisma schema, upload storage, file download authorization, payment provider, SMS, or authentication changes are expected.
