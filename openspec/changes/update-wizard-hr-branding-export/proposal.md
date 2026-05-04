## Why

The current Sana application wizard and admin export no longer match the requested operational intake rules: human-resources data is missing, required document rules have changed, Excel uploads are needed, and exported Persian data is difficult to read in Excel. Branding and logout behavior also need to align with the production `sana.ioiv.ir` deployment.

## What Changes

- Add a new `مرحله ی منابع انسانی` wizard step between audited financial statements and trial balance.
- Capture required human-resources data: positive employee count based on the latest insurance list, plus an uploaded insurance-list file that may be an Excel file.
- Keep the tax declaration UI showing three year/file rows, but require only one complete tax declaration year/file row for final submission.
- Make audited financial statements required and show support guidance for users who do not have audited financial statements: `در صورت نداشتن صورت مالی حسابرسی شده با پشتیبانی تماس حاصل فرمایید 02186122370 داخلی 3`.
- Update final submission validation, final checklist messages, draft persistence, admin file grouping, and exports to include the new HR requirement and revised document rules.
- Replace the full service name `سامانه اعتبارسنجی صندوق پژوهش و فناوری صنعت نفت (سانا)` with `سامانه اعتبار سنجی سانا`.
- Replace visible app logo usage with the provided `IOIV.png` asset and use the provided `logo ghatre.png` asset for favicon/browser icons.
- Redirect logout to `http://sana.ioiv.ir/` instead of the local root path.
- Improve admin export readability in Excel by exposing a readable XLSX export path and ensuring CSV fallback is Persian/Excel friendly.

## Capabilities

### New Capabilities

- `application-wizard-document-rules`: Wizard step order, human-resources intake, revised tax/financial requirements, and final submission validation behavior.
- `sana-branding-navigation`: Production service name, logo/favicon asset usage, and logout destination behavior.
- `readable-admin-export`: Admin export format behavior for readable Excel-compatible submission data.

### Modified Capabilities

- None.

## Impact

- Affects application draft shape, TypeScript form types, Zod validation, wizard step navigation, final review checklist, payment-start validation, upload validation, and tests.
- May require a Prisma migration to persist human-resources draft JSON separately, or a compatible storage strategy if using an existing JSON field is intentionally chosen.
- Affects upload MIME/extension allow-list to support Excel files.
- Affects admin submission detail file grouping and submission export columns.
- Affects public/admin auth pages, shared app shell logo usage, root metadata icons, SMS/payment copy, and logout route behavior.
- Requires copying provided image assets from `/Users/mahdi/Downloads/IOIV.png` and `/Users/mahdi/Downloads/logo ghatre.png` into the app's public asset paths during implementation.
