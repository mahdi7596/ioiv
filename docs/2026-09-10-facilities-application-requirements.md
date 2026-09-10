# Facilities Application Requirements — Confirmed Baseline

**Source:** Client answers from Mr. Sohankar, recorded September 10, 2026.

This document records the confirmed product decisions for the facilities route.

## Scope for This Change

- Do **not** change or reopen the existing "اعتبارسنجی شرکت‌های متقاضی ورود به
  لیست بلند تأمین‌کنندگان وزارت نفت" route for new applications at this time.
- A company that previously used the old validation route may now apply for the
  facilities route, but must first complete the expanded company profile in M3.
- This change implements the facilities route:
  "تسهیلات از محل منابع ماده ۲۸ آیین‌نامه تولید، دانش‌بنیان و اشتغال‌زایی در صنعت نفت".
- The facilities route collects **all existing/old document requirements in addition
  to** the new facilities-specific documents.
- The existing old workflow remains unchanged for its existing applications, except
  that any trial-balance labels in the new facilities workflow must refer to year **۱۴۰۵**.
- Programme availability must be configurable. M1 has no applicant-facing facilities
  route and keeps facilities unavailable until M2–M5 are complete; it does not alter
  the existing validation route’s availability.

## Login and Company Profile

After OTP authentication, a new user—and an existing user whose company profile is
incomplete—must complete the following required company profile before starting a
facilities application:

- Company name
- 11-digit company national ID
- Registration number
- Registration place
- Registration date
- Registered capital
- Existing company-contact full name and company-contact national code
- At least one shareholder, with name and ownership percentage
- At least one CEO/board member, with name and position
- Incorporation notice: one uploaded file
- Articles of association: one uploaded file
- Latest official gazette of board changes: one uploaded file
- Latest official gazette of capital increase: one uploaded file

### Shareholders

- The user can add as many shareholders as needed.
- The ownership percentages must total exactly 100%.
- Decimal percentages are allowed.

### CEO and Board Members

- The CEO must be entered in the CEO/board-member list with position `مدیرعامل`.
- Only one CEO is allowed.
- Each board member has one ZIP upload containing their national-card front/back,
  birth-certificate first page and explanation page, and resume.
- A board member's national code is **not** collected.

### File Format Direction

- The client permits applicants to attach files as needed, including questionnaire
  attachments that are not limited to ZIP files.
- Each file is limited to 25 MB and an application is limited to 150 MB in total.
- Allowed types are PDF, DOC, DOCX, XLS, XLSX, CSV, and ZIP. The server must verify
  the actual content type and scan the file before it becomes available.

## Facilities Setup

Before any document steps, the applicant selects an enabled facilities supplier.

Supplier choices, with the exact requested names:

1. شرکت ملی نفت ایران
2. شرکت ملی گاز ایران
3. شرکت ملی صنایع پتروشیمی ایران
4. شرکت ملی پالایش و پخش فرآورده‌های نفتی ایران

- Only enabled supplier choices are visible to the applicant.
- The system must support disabling choices so that only one supplier can be available
  in a given period.
- Requested facility type is exactly one of:
  - سرمایه ثابت
  - سرمایه در گردش
- Requested amount is entered in ریال, has no minimum, and has a maximum of
  ۵۰۰ میلیارد ریال.
- The maximum must be configurable in the future.
- Supplier availability, supplier-specific questionnaire templates, and related
  configuration must be managed through the admin UI by `SUPER_ADMIN` only.

## Existing Documents Required in the Facilities Route

The facilities route also requires the current legacy document flow:

- At least one complete tax declaration: year plus file
- At least one complete audited financial statement: year plus file
- Human-resources employee count and insurance-list file
- General ledger and subsidiary ledger trial-balance files for year ۱۴۰۵
- Credit reports for the company, CEO, and one board member

## New Facilities-Specific Documents

### Supplier-specific questionnaire

- The administrator supplies one Word questionnaire template for each of the four
  facilities suppliers.
- When the applicant selects a supplier, the corresponding questionnaire is displayed
  for download.
- The applicant completes and uploads that questionnaire as a Word file.
- All questionnaire-related information/files must be recorded.
- The exact questionnaire template/version downloaded by an applicant must be retained
  with the application.
- Questionnaire attachments are optional and may be one or more uploaded files in
  safe supported formats; they are not limited to ZIP.

### Other documents

- Licences and certificates are required as one ZIP file. A company without licences
  or certificates is not eligible to apply.
- VAT declarations are repeatable year-plus-ZIP entries. Year ۱۴۰۴ is mandatory;
  ۱۴۰۳ and ۱۴۰۲ can additionally be selected.
- The list of active contracts and contract images is required as one ZIP file.
- A "no active contracts" alternative is not required.

## Submission, Payment, Corrections, and Notifications

- Before payment, ask the company to confirm whether it wants to make any change; if
  it does, return it to editing before payment begins.
- After payment, the company may edit only after a reviewer requests corrections.
- The correction cycle may occur multiple times.
- When a reviewer allows correction, all information and files may be edited.
- There is only one payment, if payment is required at all; correction cycles do not
  require another payment.
- Payment is enabled at 3,000,000 تومان for this release and may be disabled later
  by client direction.
- The payment acknowledgement wording remains release-copy draft and requires the
  product owner’s copy approval before it is shown to applicants.
- Keep change history.
- When a file is replaced, delete the prior physical file and retain only safe
  non-content revision/audit metadata.
- For now, send SMS only when a reviewer requests corrections.
- When an applicant submits corrections, return the application automatically to the
  review queue.
- Add an append-only audit log for user, admin, and system actions. It must record
  safe action metadata and must never store OTP codes, secrets, payment credentials,
  or document contents.
- Audit events use a defined action vocabulary and capture outcome and optional
  request correlation information. They are written in the same database transaction
  as the action they describe.
- Audit records are immutable to the application runtime. IP address and user-agent
  values, when collected, are limited and must be treated as protected personal data.

## Export Requirements

- Admins can export the application data to Excel.
- The export must include all fields the applicant entered.
- File download links may be included. A link must require an authenticated,
  authorized admin session when opened; it must not expose a public file URL.

The initial export filters are intake, supplier, status, and date range.

## Confirmed M0 implementation decisions

- A company may submit one facilities application per intake.
- Registered capital is entered and stored in ریال.
- The existing `VALIDATION_COMPLETED` state is the facilities route’s final outcome;
  the route does not create a facilities completion certificate.
- One OTP-authenticated user owns one company for this release. Multi-user company
  access is out of scope.
- Existing users and legacy applications are not backfilled into the facilities
  company model. Existing users complete the expanded company profile when M3 is
  delivered.
- The M1 seed contains only the four confirmed suppliers. It must not invent an
  intake, date, availability, or questionnaire template.
- M1 seeds only the four confirmed suppliers. It does not seed programme availability,
  an intake, a date, a supplier availability, or a questionnaire template. Facilities
  remains unavailable until M2–M5 are complete and `SUPER_ADMIN` configuration is
  delivered.
