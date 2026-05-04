## 1. Data Model And Types

- [x] 1.1 Add `humanResources` draft storage to the Prisma `Application` model with a default empty object and create the migration.
- [x] 1.2 Regenerate Prisma client artifacts after the migration.
- [x] 1.3 Add TypeScript draft types for human-resources employee count and insurance-list file references.
- [x] 1.4 Load and save `humanResources` in application draft server actions and dashboard application page hydration.

## 2. Validation And Upload Rules

- [x] 2.1 Update draft validation to accept partial human-resources data and six valid wizard steps.
- [x] 2.2 Update final submission validation to require one complete tax declaration row instead of three.
- [x] 2.3 Update final submission validation to require one complete audited financial statement row.
- [x] 2.4 Add final submission validation for positive employee count greater than 0 and required insurance-list upload.
- [x] 2.5 Allow Excel insurance-list uploads by extending upload extension and MIME validation according to the design decision.

## 3. Wizard UI

- [x] 3.1 Update the wizard step definitions to six ordered steps with `مرحله ی منابع انسانی` between financial statements and trial balance.
- [x] 3.2 Add a `HumanResourcesStep` component with the employee count number field and insurance-list upload field.
- [x] 3.3 Ensure the employee count input only accepts positive numeric values greater than 0 and preserves draft autosave behavior.
- [x] 3.4 Keep the tax declaration step showing three default rows while aligning messages with the one-complete-row requirement.
- [x] 3.5 Update the audited financial statements step to show the requested support guidance and support phone number.
- [x] 3.6 Update final review checklist messages for tax, audited financial statements, human resources, and existing required document groups.

## 4. Admin Detail And Export

- [x] 4.1 Add a human-resources document group to admin submission file display so insurance-list uploads are labeled and not treated as unknown.
- [x] 4.2 Add employee count and insurance-list completion columns to submission export rows.
- [x] 4.3 Update export completion columns to reflect one required tax declaration and required audited financial statements.
- [x] 4.4 Make XLSX the primary visible admin export action from the submissions page.
- [x] 4.5 Keep CSV fallback available and encode it so Persian text opens readably in Excel.

## 5. Branding And Navigation

- [x] 5.1 Copy `/Users/mahdi/Downloads/IOIV.png` into `public/` with a stable app-logo filename.
- [x] 5.2 Copy `/Users/mahdi/Downloads/logo ghatre.png` into `public/` with a stable favicon filename.
- [x] 5.3 Replace all visible logo references with the new app-logo asset.
- [x] 5.4 Replace metadata icon, shortcut icon, and apple icon references with the new favicon asset.
- [x] 5.5 Replace `سامانه اعتبارسنجی صندوق پژوهش و فناوری صنعت نفت (سانا)` with `سامانه اعتبار سنجی سانا` across app copy, SMS copy, payment copy, and metadata.
- [x] 5.6 Update logout to clear the session and redirect to `http://sana.ioiv.ir/`.

## 6. Tests And Verification

- [x] 6.1 Update validation tests for one required tax declaration, required audited financial statements, HR requirements, and six-step draft bounds.
- [x] 6.2 Add or update upload validation tests for Excel file acceptance.
- [x] 6.3 Add or update export tests for HR columns, revised completion rules, XLSX generation, and CSV Persian readability.
- [x] 6.4 Run the focused test suite for validation/export/upload behavior.
- [x] 6.5 Run `npm run build`.
- [x] 6.6 Manually smoke-test the applicant wizard through final review and admin export after implementation.
