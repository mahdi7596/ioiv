## ADDED Requirements

### Requirement: Six-step application wizard
The system SHALL present the application wizard as six ordered steps: tax declaration, audited financial statements, human resources, trial balance, credit report, and final confirmation/payment.

#### Scenario: Wizard displays human resources step in order
- **WHEN** a user opens the application wizard
- **THEN** the progress indicator shows a total of six steps
- **AND** `مرحله ی منابع انسانی` appears between `صورت‌های مالی حسابرسی شده` and `تراز کل و معین`

#### Scenario: Existing draft step is bounded
- **WHEN** the system loads or saves an application draft step
- **THEN** valid current step values are bounded from 1 through 6

### Requirement: Human resources intake
The system SHALL collect required human-resources information before final payment/submission.

#### Scenario: User enters employee count
- **WHEN** the user views `مرحله ی منابع انسانی`
- **THEN** the system shows a number field labeled `تعداد نیروی انسانی بر اساس اخرین لیست بیمه`
- **AND** the field only accepts numbers greater than 0

#### Scenario: User uploads insurance list
- **WHEN** the user views `مرحله ی منابع انسانی`
- **THEN** the system shows a required upload field labeled `اپلود لیست بیمه`
- **AND** the upload field accepts Excel files in addition to the existing allowed document upload types

#### Scenario: Missing human resources data
- **WHEN** the employee count is missing, invalid, or the insurance list file is missing
- **THEN** the system blocks final payment/submission and shows actionable completion guidance in the final review

### Requirement: Tax declaration minimum
The system SHALL keep three visible tax declaration rows while requiring only one complete tax declaration year/file row for final payment/submission.

#### Scenario: Tax declaration UI shows three rows
- **WHEN** the user opens the tax declaration step with no saved rows
- **THEN** the system displays three year/file rows

#### Scenario: One complete tax declaration is sufficient
- **WHEN** at least one tax declaration row has both a year and file
- **AND** all other non-empty tax declaration rows are complete
- **THEN** tax declaration validation allows final payment/submission to continue

#### Scenario: No complete tax declaration
- **WHEN** no tax declaration row has both a year and file
- **THEN** the system blocks final payment/submission

### Requirement: Required audited financial statements
The system SHALL require at least one complete audited financial statement year/file row before final payment/submission.

#### Scenario: Financial statements support guidance
- **WHEN** the user views the audited financial statements step
- **THEN** the system displays `در صورت نداشتن صورت مالی حسابرسی شده با پشتیبانی تماس حاصل فرمایید`
- **AND** the system displays the support number `02186122370 داخلی 3`

#### Scenario: Missing audited financial statement
- **WHEN** no audited financial statement row has both a year and file
- **THEN** the system blocks final payment/submission

#### Scenario: Incomplete audited financial statement row
- **WHEN** an audited financial statement row has either year or file but not both
- **THEN** the system blocks final payment/submission

#### Scenario: Complete audited financial statement
- **WHEN** at least one audited financial statement row has both a year and file
- **AND** all other non-empty audited financial statement rows are complete
- **THEN** audited financial statement validation allows final payment/submission to continue

### Requirement: Final review includes revised document requirements
The system SHALL summarize all revised required document and human-resources requirements in the final review.

#### Scenario: Final review lists missing requirements
- **WHEN** any revised requirement is missing or invalid
- **THEN** the final review identifies the specific missing tax, audited financial statement, human resources, trial balance, credit report, or payment acknowledgement item

#### Scenario: Final review allows payment when complete
- **WHEN** one tax declaration, one audited financial statement, human-resources fields, trial balance files, credit report files, and payment acknowledgement are valid
- **THEN** the system allows the user to start payment or send corrections

### Requirement: Admin visibility for human resources files
The system SHALL show human-resources insurance-list uploads as a recognized document group in admin submission details.

#### Scenario: Admin views uploaded insurance list
- **WHEN** an admin opens a submission detail containing the HR insurance-list upload
- **THEN** the file appears under a human-resources document group with a meaningful Persian field label
- **AND** the file does not appear as an unknown field
