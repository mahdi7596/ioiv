## ADDED Requirements

### Requirement: Trial balance labels mention year 1404
The system SHALL display year `1404` in user-facing labels for the required `تراز کل و معین` uploads.

#### Scenario: User views trial balance step
- **WHEN** a user opens the `تراز کل و معین` step
- **THEN** the required `تراز کل` upload label mentions year `1404`
- **AND** the required `تراز معین` upload label mentions year `1404`

#### Scenario: User views wizard progress
- **WHEN** the application wizard displays the trial-balance step title
- **THEN** the title communicates `تراز کل و معین` for year `1404`

#### Scenario: User views final review
- **WHEN** the final payment/review step summarizes trial-balance completion or missing files
- **THEN** the trial-balance copy mentions year `1404`

### Requirement: Admin-facing trial balance labels stay understandable
The system SHALL preserve recognizable admin-facing trial-balance grouping while reflecting the `1404` year where file labels are shown.

#### Scenario: Admin reviews trial balance uploads
- **WHEN** an admin opens a submission that contains trial-balance files
- **THEN** the files appear under the trial-balance group
- **AND** the displayed file labels mention year `1404`
