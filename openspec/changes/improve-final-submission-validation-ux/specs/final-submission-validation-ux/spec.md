## ADDED Requirements

### Requirement: Actionable final review checklist
The system SHALL show a final review checklist that identifies completed document groups and provides exact Persian recovery messages for incomplete or inconsistent required data.

#### Scenario: Uploaded file missing selected year
- **WHEN** a user uploads a file in a year/file row but does not select the row year before reaching final review
- **THEN** the final review shows an error message naming that row and instructing the user to select the missing year

#### Scenario: Selected year missing uploaded file
- **WHEN** a user selects a year in a year/file row but does not upload the row file before reaching final review
- **THEN** the final review shows an error message naming that row and instructing the user to upload the missing file

#### Scenario: Required upload group incomplete
- **WHEN** any required trial balance or credit report upload is missing before final review
- **THEN** the final review shows an error message naming the missing upload

#### Scenario: Document group complete
- **WHEN** a document group satisfies its final submission requirements
- **THEN** the final review shows the group as complete with a distinct completed style

### Requirement: Payment button gating
The system SHALL keep the `پرداخت و ارسال نهایی` button disabled until the final application data is valid and the non-refundable payment acknowledgement checkbox is checked.

#### Scenario: Form has validation errors
- **WHEN** the final review has one or more validation errors
- **THEN** the final payment button is disabled

#### Scenario: Terms are not acknowledged
- **WHEN** the final review has no validation errors but the payment acknowledgement checkbox is unchecked
- **THEN** the final payment button is disabled

#### Scenario: Form valid and terms acknowledged
- **WHEN** the final review has no validation errors and the payment acknowledgement checkbox is checked
- **THEN** the final payment button is enabled

#### Scenario: Invalid payment attempt guard
- **WHEN** a payment start is attempted while final validation is invalid
- **THEN** the system blocks payment start and shows a visible Persian error message

### Requirement: Optional financial statement validation
The system SHALL allow audited financial statements to remain empty while blocking partially completed audited financial statement rows.

#### Scenario: Financial statements empty
- **WHEN** the user has not provided any audited financial statement year/file pair
- **THEN** final validation allows the user to continue if all other required data and acknowledgement are valid

#### Scenario: Financial statement row partially complete
- **WHEN** an audited financial statement row has either a selected year or an uploaded file but not both
- **THEN** final validation blocks payment and the final review identifies the missing value for that row

### Requirement: Linked credit report instruction notice
The system SHALL display the credit report acquisition instruction as a visually prominent notice with `https://www.mycredit.ir/` as an external link.

#### Scenario: User clicks mycredit link
- **WHEN** the user clicks `https://www.mycredit.ir/` in the credit report step instruction
- **THEN** the browser opens the link in a new tab or window

#### Scenario: Credit report instruction displayed
- **WHEN** the user views the credit report step
- **THEN** the instruction appears with distinct notice styling separate from ordinary body text
