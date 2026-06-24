## Requirements

### Requirement: Ghasedak SMS template is registered
A named template SHALL be registered on the Ghasedak panel for the user thank-you SMS before deployment.

#### Scenario: Template text is submitted and name is received
- **WHEN** the thank-you text "ضمن تشکر از اعتماد شما، کارشناسان کالان حساب در اولین فرصت با شما تماس خواهند گرفت." is submitted to the Ghasedak panel
- **THEN** the panel approves it and returns a template name that can be set as `GHASEDAK_KALAN_HESAB_USER_TEMPLATE`

---

### Requirement: GHASEDAK_KALAN_HESAB_USER_TEMPLATE is set in production
The production environment SHALL have `GHASEDAK_KALAN_HESAB_USER_TEMPLATE` set to the Ghasedak-assigned template name before the application is started.

#### Scenario: Environment variable is present at deploy time
- **WHEN** the `kalan-hesab-form-submission` branch is deployed
- **THEN** the environment variable `GHASEDAK_KALAN_HESAB_USER_TEMPLATE` resolves to the registered template name

---

### Requirement: form.kalanhesab.com resolves to the production server
The domain `form.kalanhesab.com` SHALL be pointed to the production server via an A or CNAME DNS record.

#### Scenario: DNS resolves correctly
- **WHEN** a browser navigates to `form.kalanhesab.com`
- **THEN** the request reaches the production server and the Kalan Hesab form is served

---

### Requirement: kalan-hesab-form-submission branch is deployed to production
The production server SHALL run the code from the `kalan-hesab-form-submission` branch, not `master`.

#### Scenario: Branch is deployed
- **WHEN** the deployment is complete
- **THEN** the routes `/kalan-hesab`, `/kalan-hesab/admin`, and all `/api/kalan-hesab/*` endpoints are available in production

---

### Requirement: add_kalan_hesab_submission migration is applied
The migration `add_kalan_hesab_submission` SHALL be applied to the production database before any form submissions are accepted.

#### Scenario: Migration runs successfully
- **WHEN** `npm run db:migrate` is executed on the production server
- **THEN** the `KalanHesabSubmission` table exists, `KALAN_HESAB_VERIFICATION` is a valid `OtpPurpose`, and `KALAN_HESAB_ADMIN` is a valid `UserRole`

---

### Requirement: Two KALAN_HESAB_ADMIN accounts exist in production
Running `npm run db:seed` on production SHALL insert admin accounts for 09224872163 and 09390649614 with role `KALAN_HESAB_ADMIN`.

#### Scenario: Seed creates both admin accounts
- **WHEN** `npm run db:seed` is run on the production database
- **THEN** records exist for mobile 09224872163 (name: "کالان حساب - مدیر اول") and 09390649614 (name: "کالان حساب - مدیر دوم"), both with role `KALAN_HESAB_ADMIN` and `active: true`

#### Scenario: Seed is idempotent
- **WHEN** `npm run db:seed` is run more than once
- **THEN** no duplicate records are created (`skipDuplicates: true`)

---

### Requirement: Smoke test — form submission sends all three SMS messages
After deployment, submitting one real form on `form.kalanhesab.com` SHALL trigger all three SMS messages.

#### Scenario: User receives thank-you SMS
- **WHEN** a real form is submitted on `form.kalanhesab.com`
- **THEN** the submitter's mobile receives: "ضمن تشکر از اعتماد شما، کارشناسان کالان حساب در اولین فرصت با شما تماس خواهند گرفت."

#### Scenario: First admin receives notification
- **WHEN** a real form is submitted with fullName "X"
- **THEN** 09224872163 receives: "فرم جدید در کالان حساب ثبت شد - X"

#### Scenario: Second admin receives notification
- **WHEN** a real form is submitted with fullName "X"
- **THEN** 09390649614 receives: "فرم جدید در کالان حساب ثبت شد - X"
