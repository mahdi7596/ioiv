## ADDED Requirements

### Requirement: Admin sees HR employee count during review
The system SHALL show the human-resources employee count in admin submission details using the same business meaning as the user-facing HR step.

#### Scenario: Admin views submitted HR count
- **WHEN** an admin opens a submission detail page for an application with `humanResources.employeeCount`
- **THEN** the page shows `تعداد نیروی انسانی بر اساس آخرین لیست بیمه` with the saved count in Persian number formatting

#### Scenario: Admin reviews HR file and count together
- **WHEN** an admin reviews the منابع انسانی section for an application with an uploaded insurance list
- **THEN** the employee count and insurance-list upload are visible in the same human-resources review context

#### Scenario: Missing HR count is explicit
- **WHEN** an admin opens a submission detail page for an application without a saved employee count
- **THEN** the page shows an explicit empty value for the employee count instead of hiding the field

### Requirement: HR employee count display tolerates stored numeric strings
The system SHALL display valid employee-count values that are stored as either numbers or numeric strings.

#### Scenario: Numeric string count is shown
- **WHEN** `humanResources.employeeCount` is stored as a string containing ASCII, Persian, or Arabic digits
- **THEN** the admin detail page parses and displays the finite positive count in Persian number formatting

#### Scenario: Invalid count is not shown as valid
- **WHEN** `humanResources.employeeCount` is missing, zero, negative, non-finite, or non-numeric
- **THEN** the admin detail page renders the employee-count value as missing
