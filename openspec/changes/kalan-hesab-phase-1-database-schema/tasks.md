## 1. Prisma Schema — Enum Extensions

- [x] 1.1 Add `KALAN_HESAB_VERIFICATION` to the `OtpPurpose` enum in `prisma/schema.prisma`
- [x] 1.2 Add `KALAN_HESAB_ADMIN` to the `UserRole` enum in `prisma/schema.prisma`

## 2. Prisma Schema — New Model

- [x] 2.1 Add `KalanHesabSubmission` model to `prisma/schema.prisma` with all required fields: `id`, `fullName`, `companyName`, `position`, `positionOther`, `teamSize`, `mainConcern`, `concernOther`, `mobile`, `createdAt`
- [x] 2.2 Add `@@index([createdAt])` to `KalanHesabSubmission`
- [x] 2.3 Add `@@index([mobile])` to `KalanHesabSubmission`

## 3. Database Migration

- [x] 3.1 Run `npm run db:migrate` with migration name `add_kalan_hesab_submission` and confirm the migration applies without errors
- [x] 3.2 Verify the `KalanHesabSubmission` table exists in the database after the migration
- [x] 3.3 Verify `KALAN_HESAB_VERIFICATION` and `KALAN_HESAB_ADMIN` appear as valid enum values in PostgreSQL

## 4. Seed — Admin Accounts

- [x] 4.1 Add `createMany` call in `prisma/seed.ts` to insert the two `KALAN_HESAB_ADMIN` admin rows (`09224872163` and `09390649614`) with `skipDuplicates: true`
- [x] 4.2 Run `npm run db:seed` and confirm both rows are present in the `Admin` table
- [x] 4.3 Run `npm run db:seed` a second time and confirm no error is thrown and no duplicate rows appear
