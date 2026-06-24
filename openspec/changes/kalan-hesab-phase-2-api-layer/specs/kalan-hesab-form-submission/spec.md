## ADDED Requirements

### Requirement: Two new SMS factory functions in lib/sms/messages.ts
The system SHALL export `createKalanHesabUserSmsMessage(to)` and `createKalanHesabAdminSmsMessage(to, fullName)` from `lib/sms/messages.ts`.

#### Scenario: User SMS factory returns correct shape
- **WHEN** `createKalanHesabUserSmsMessage("09xxxxxxxxx")` is called
- **THEN** it returns `{ to: "09xxxxxxxxx", text: "ضمن تشکر از اعتماد شما، کارشناسان کالان حساب در اولین فرصت با شما تماس خواهند گرفت.", template: process.env.GHASEDAK_KALAN_HESAB_USER_TEMPLATE }`

#### Scenario: Admin SMS factory returns correct shape
- **WHEN** `createKalanHesabAdminSmsMessage("09224872163", "رضا احمدی")` is called
- **THEN** it returns `{ to: "09224872163", text: "فرم جدید در کالان حساب ثبت شد - رضا احمدی" }`
- **AND** no `template` property is set

---

### Requirement: POST /api/kalan-hesab/submit persists submission and sends 3 SMS
The system SHALL validate the request body with a Zod schema, check `verified === true`, save a `KalanHesabSubmission` row, and send one SMS to the user and one each to `09224872163` and `09390649614`.

#### Scenario: Valid submission is saved and SMS sent
- **GIVEN** a fully valid body including all required fields and `verified: true`
- **WHEN** POST `/api/kalan-hesab/submit` is called
- **THEN** a `KalanHesabSubmission` row is created with all provided field values
- **AND** `sendSms(createKalanHesabUserSmsMessage(mobile))` is called
- **AND** `sendSms(createKalanHesabAdminSmsMessage("09224872163", fullName))` is called
- **AND** `sendSms(createKalanHesabAdminSmsMessage("09390649614", fullName))` is called
- **AND** the response is `200 { ok: true }`

#### Scenario: Missing verified flag returns 400
- **GIVEN** a valid form body but `verified` is absent or `false`
- **WHEN** POST `/api/kalan-hesab/submit` is called
- **THEN** the response is `400 { error: "اطلاعات فرم ناقص یا نامعتبر است" }`
- **AND** no DB row is saved and no SMS is sent

#### Scenario: Invalid position enum value returns 400
- **GIVEN** a body with `position = "مدیرکل"` (not a valid enum value)
- **WHEN** POST `/api/kalan-hesab/submit` is called
- **THEN** the response is `400 { error: "اطلاعات فرم ناقص یا نامعتبر است" }`

#### Scenario: positionOther is stored when position = سایر
- **GIVEN** `position = "سایر"` and `positionOther = "مشاور"`
- **WHEN** a valid submission is saved
- **THEN** `KalanHesabSubmission.positionOther = "مشاور"`

#### Scenario: concernOther is stored when mainConcern = سایر
- **GIVEN** `mainConcern = "سایر"` and `concernOther = "بیمه"`
- **WHEN** a valid submission is saved
- **THEN** `KalanHesabSubmission.concernOther = "بیمه"`

#### Validation schema (Zod)
```ts
z.object({
  fullName:      z.string().min(2),
  companyName:   z.string().min(1),
  position:      z.enum(["مدیرعامل", "عضو هیئت مدیره", "مدیرمالی", "صاحب کسب‌وکار", "سایر"]),
  positionOther: z.string().optional(),
  teamSize:      z.enum(["کمتر از ۱۰", "۱۰ تا ۵۰", "۵۰ تا ۲۰۰", "بیش از ۲۰۰"]),
  mainConcern:   z.enum(["مدیریت مالی", "مالیات", "تامین اجتماعی", "گزارشات مدیریتی", "حسابرسی", "تامین مالی", "سایر"]),
  concernOther:  z.string().optional(),
  mobile:        mobileSchema,
  verified:      z.literal(true),
})
```
