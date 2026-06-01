# Database Overview

This project uses PostgreSQL with Prisma ORM.

- Prisma schema: `prisma/schema.prisma`
- Database provider: `postgresql`
- Connection env var: `DATABASE_URL`
- Local Docker database: `postgres:16-alpine`
- Docker exposed port: `55433` on the host, mapped to `5432` in the container
- Main local commands:
  - `npm run db:migrate`
  - `npm run db:seed`
  - `npm run db:studio`

## Tables

### User

End-user account created through mobile OTP login/registration.

Fields:

- `id`
- `mobile` unique
- `companyName`
- `companyNationalId`
- `companyContactFullName`
- `companyContactNationalCode`
- `nationalCode`
- `createdAt`
- `updatedAt`

Notes:

- `mobile` is required.
- Company registration details are collected when a new user registers.
- `nationalCode` exists in the schema but current registration UI mainly collects the company contact national code.
- One user can have many applications.

### Admin

Admin user allowed to review submissions.

Fields:

- `id`
- `name`
- `mobile` unique
- `role`: `USER`, `ADMIN`, `SUPER_ADMIN`
- `active`
- `createdAt`
- `updatedAt`

### OtpCode

Stores one-time password login codes for users and admins.

Fields:

- `id`
- `mobile`
- `codeHash`
- `purpose`: `USER_LOGIN`, `ADMIN_LOGIN`
- `expiresAt`
- `consumedAt`
- `createdAt`

Notes:

- OTP codes are hashed with bcrypt.
- OTP validity is 2 minutes.
- OTP request limits are enforced in application code.

### Application

Main submitted company application/registration file.

Fields:

- `id`
- `userId`
- `mobile`
- `companyName`
- `companyNationalId`
- `companyContactFullName`
- `companyContactNationalCode`
- `nationalCode`
- `applicationRound`
- `status`: `DRAFT`, `PENDING_PAYMENT`, `SUBMITTED`, `UNDER_REVIEW`, `NEEDS_EDIT`, `VALIDATION_COMPLETED`
- `currentStep`
- `taxDeclarations` JSON
- `financials` JSON
- `humanResources` JSON
- `trialBalance` JSON
- `creditReports` JSON
- `adminNote`
- `submittedAt`
- `createdAt`
- `updatedAt`

Constraints and indexes:

- Unique: `mobile`, `companyNationalId`, `applicationRound`
- Index: `status`
- Index: `companyNationalId`

### ApplicationFile

Metadata for uploaded files. Actual files are stored on disk under `UPLOAD_DIR`, not inside Postgres.

Fields:

- `id`
- `applicationId`
- `fieldKey`
- `originalName`
- `mimeType`
- `size`
- `storagePath`
- `createdAt`

Notes:

- Index: `applicationId`, `fieldKey`
- Allowed upload extensions: `.pdf`, `.doc`, `.docx`, `.zip`, `.xls`, `.xlsx`, `.csv`
- Max upload size: 20 MB

### Payment

Payment attempts for an application.

Fields:

- `id`
- `applicationId`
- `amountToman`
- `gateway`
- `authority`
- `referenceId`
- `status`: `INITIATED`, `VERIFIED`, `FAILED`
- `rawData` JSON
- `createdAt`
- `updatedAt`

Notes:

- Current gateway default: `zarinpal`
- Current configured amount: `3,000,000` toman

### StatusHistory

Audit trail for application status changes.

Fields:

- `id`
- `applicationId`
- `previousStatus`
- `newStatus`
- `changedById`
- `note`
- `createdAt`

Notes:

- `changedById` stores the admin id when changed by an admin.
- Index: `applicationId`

## User Information Collected

Registration/user identity:

- Mobile number
- Company name
- Company national ID, 11 digits
- Company contact full name
- Company contact national code, 10 digits
- `nationalCode` field exists in DB for the user/application, but the current main registration UI stores company contact national code separately.

Application documents and data:

- Tax declarations: list of `{ year, file }`
- Audited financial statements: list of `{ year, file }`
- Human resources:
  - Employee count
  - Insurance list file
- Trial balance:
  - General ledger trial balance file
  - Subsidiary ledger trial balance file
- Credit reports:
  - Company credit report file
  - CEO credit report file
  - Board member credit report file

Payment/user submission metadata:

- Payment amount
- Gateway authority
- Gateway reference id
- Payment status
- Raw gateway response data
- Application status
- Admin review notes
- Status change history
- Submission timestamp

## JSON Shapes Stored In Application

`taxDeclarations`:

```json
[
  {
    "year": "1402",
    "file": {
      "fileId": "application-file-id",
      "name": "tax-declaration.pdf"
    }
  }
]
```

`financials`:

```json
[
  {
    "year": "1402",
    "file": {
      "fileId": "application-file-id",
      "name": "audited-financials.pdf"
    }
  }
]
```

`humanResources`:

```json
{
  "employeeCount": 24,
  "insuranceList": {
    "fileId": "application-file-id",
    "name": "insurance-list.xlsx"
  }
}
```

`trialBalance`:

```json
{
  "generalLedger": {
    "fileId": "application-file-id",
    "name": "general-ledger.pdf"
  },
  "subsidiaryLedger": {
    "fileId": "application-file-id",
    "name": "subsidiary-ledger.pdf"
  }
}
```

`creditReports`:

```json
{
  "company": {
    "fileId": "application-file-id",
    "name": "company-credit-report.pdf"
  },
  "ceo": {
    "fileId": "application-file-id",
    "name": "ceo-credit-report.pdf"
  },
  "boardMember": {
    "fileId": "application-file-id",
    "name": "board-member-credit-report.pdf"
  }
}
```

## Relationships

- `User` has many `Application`
- `Application` belongs to `User`
- `Application` has many `ApplicationFile`
- `Application` has many `Payment`
- `Application` has many `StatusHistory`
- `OtpCode` is keyed by mobile and purpose, with no direct foreign key to `User` or `Admin`
- `StatusHistory.changedById` stores an admin id, but it is not declared as a Prisma foreign key

