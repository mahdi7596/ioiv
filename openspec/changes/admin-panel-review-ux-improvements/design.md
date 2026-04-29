## Context

The admin dashboard already has the underlying data and routes needed for the requested UX improvements:

- `/admin` loads overview counts through `getAdminOverview()`.
- `/admin/submissions` accepts `q`, `status`, and `sort` query params and passes them to `listSubmissions()`.
- The submissions table already renders application status and latest payment status.
- Submission detail already loads `files`, `payments`, `history`, and the full application record, including JSON fields that contain selected years for year-based document rows.
- Protected downloads already go through `/api/files/[id]`.

This means the change can be mostly presentation and navigation, with no database migration.

## Goals / Non-Goals

**Goals:**

- Let admins move from overview counts to the exact filtered submissions table with one click.
- Make search feel immediate while retaining URL-driven, server-side list data.
- Make status and payment state visually scannable.
- Replace noisy textual row actions with accessible icon actions.
- Make uploaded files understandable by business meaning, not raw `fieldKey`.
- Show selected years for tax declarations and audited financial statements whenever the user selected a year.
- Keep protected file downloads explicit with a download action beside each file.

**Non-Goals:**

- Add client-side-only table data loading or a new API for submissions.
- Add file preview, bulk download, virus scanning, or file replacement from admin.
- Change upload storage paths or file authorization.
- Change status transition rules.
- Add new application/payment statuses.

## Decisions

### Use URL query params as the filter contract

Overview cards should link to `/admin/submissions` with the same `status` values the existing filter uses. The total card should link to `/admin/submissions` without a status param. This keeps bookmarks, exports, and server-rendered data aligned.

```
Overview card
      │
      ▼
/admin/submissions?status=UNDER_REVIEW
      │
      ▼
listSubmissions({ status: "UNDER_REVIEW" })
      │
      ▼
Filtered server-rendered table
```

### Make instant search a small client enhancement

The filter form can become a client component that writes query params through Next navigation as inputs change. Search text should be debounced briefly to avoid excessive server navigations, while select changes can apply immediately. This preserves the page rendering model because the authoritative data still comes from `searchParams` and `listSubmissions()`.

### Centralize badge labels and variants

Application status labels already exist in `StatusBadge`. The component should map each known status to a semantic badge variant. Payment status should get a sibling component rather than mixing payment state into the application status component.

Suggested semantic mapping:

| State | Treatment |
| --- | --- |
| `DRAFT` | neutral |
| `PENDING_PAYMENT` / `INITIATED` | warning |
| `SUBMITTED` | info |
| `UNDER_REVIEW` | review/in-progress |
| `NEEDS_EDIT` | attention |
| `ACCEPTED` / `VERIFIED` | success |
| `REJECTED` / `FAILED` | danger |
| missing payment | muted |

### Use lucide icons only for clear actions

Use `lucide-react` for obvious admin actions such as opening details and downloading files. Icon-only controls must keep accessible names through `aria-label` or visually hidden text.

### Categorize files from field keys plus draft JSON

Uploaded file records include raw `fieldKey`; the related application JSON includes selected years for repeating year/file rows. The detail page can derive display groups from those two sources.

```
ApplicationFile.fieldKey       Application JSON source        Admin display
────────────────────────       ───────────────────────        ─────────────
taxDeclarations.0.file    +    taxDeclarations[0].year   →    اظهارنامه مالیاتی، سال ۱۴۰۲
financials.1.file         +    financials[1].year        →    صورت مالی حسابرسی‌شده، سال ۱۴۰۱
trialBalance.generalLedger     static mapping             →    تراز کل
creditReports.ceo              static mapping             →    گزارش اعتبارسنجی مدیرعامل
```

If a selected year is unavailable, the UI should still show the document label and make the missing year visible with a muted `سال ثبت نشده` indicator.

## Risks / Trade-offs

- Instant search can trigger many server renders if not debounced; use a short debounce for text input.
- Raw JSON fields may be malformed or missing historical row data; categorization should degrade gracefully and still show every uploaded file.
- Icon-only actions can become unclear without accessible labels and hover/focus states.
- Badge colors must remain readable in RTL table density and across mobile widths.

## Verification

- Click each overview card and confirm the submissions table opens with the expected URL filter and rows.
- Type into search and confirm the URL/table update without needing the `اعمال` button.
- Change status and sort filters and confirm export links preserve active filters.
- Confirm application status and payment status badges render distinct styles for all known enum values and missing payment.
- Confirm the details icon opens the correct submission.
- Confirm the submission detail file section groups files by document purpose, shows selected year for year-based uploads, shows all uploaded files even if metadata is incomplete, and each download action uses `/api/files/[id]`.
- Run lint/build after implementation.
