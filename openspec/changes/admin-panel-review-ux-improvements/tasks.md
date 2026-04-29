## 1. Dependency And Shared UI

- [x] 1.1 Install `lucide-react`.
- [x] 1.2 Update or create reusable admin badge components for application status and payment status.
- [x] 1.3 Add focused CSS for badges, icon buttons, clickable metrics, filter controls, and categorized file lists.

## 2. Overview Navigation

- [x] 2.1 Convert admin overview metric cards into accessible links.
- [x] 2.2 Map each status card to the matching `/admin/submissions?status=...` query.
- [x] 2.3 Keep the total card linked to `/admin/submissions` without a status filter.
- [x] 2.4 Verify keyboard focus, hover states, and RTL layout for clickable cards.

## 3. Submissions Filter UX

- [x] 3.1 Extract the submissions filters into a client component that reads initial `q`, `status`, and `sort` values.
- [x] 3.2 Update URL query params as search text changes with a short debounce.
- [x] 3.3 Update URL query params immediately when status or sort changes.
- [x] 3.4 Keep server-side `listSubmissions()` and export query behavior authoritative.

## 4. Submissions Table

- [x] 4.1 Render application statuses with dedicated status badge styles.
- [x] 4.2 Render latest payment statuses with dedicated payment badge styles.
- [x] 4.3 Replace the textual `مشاهده` action with an accessible lucide icon link.
- [x] 4.4 Verify table layout remains readable on small and desktop widths.

## 5. Submission Detail File Categorization

- [x] 5.1 Add a helper or component that maps uploaded `fieldKey` values to Persian document labels.
- [x] 5.2 Read selected years from `taxDeclarations` and `financials` JSON rows and display them beside matching uploads.
- [x] 5.3 Group files into tax declarations, audited financial statements, trial balance, credit reports, and uncategorized fallback.
- [x] 5.4 Render each file with field purpose, selected year when available, filename, upload date, size, and a dedicated download action.
- [x] 5.5 Preserve protected download links through `/api/files/[id]`.
- [x] 5.6 Show a clear empty state when no files are uploaded.

## 6. Verification

- [x] 6.1 Run `npm run lint`.
- [x] 6.2 Run `npm run build`.
- [x] 6.3 Manually verify overview-card filters, instant search, status/payment badges, icon detail links, and categorized downloads in the admin panel.

## 7. Icon-Only Admin Polish Follow-Up

- [x] 7.1 Add lucide icons to app navigation, logout, dashboard, submissions, overview, and back actions wherever those controls appear.
- [x] 7.2 Improve export actions with icon-only XLSX and CSV controls that keep accessible labels.
- [x] 7.3 Remove the visible automatic-filter status text.
- [x] 7.4 Preserve focus in the search input while debounced URL search updates run.
- [x] 7.5 Verify lint and build after the polish changes.
- [x] 7.6 Restore visible labels beside icons and present export actions as text-and-icon buttons above the table.

## 8. Status Transition UX Follow-Up

- [x] 8.1 Show only valid admin status transition options and explain unavailable transitions on submission detail pages.

## 9. Edit Request Status Correction

- [x] 9.1 Let admins send submitted entries back for user edits directly, keep the status change section sticky at the bottom, and reveal the optional admin description after the admin chooses to change status.
