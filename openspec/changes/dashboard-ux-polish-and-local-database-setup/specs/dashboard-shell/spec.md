## ADDED Requirements

### Requirement: Authenticated app shell
Authenticated user and admin pages SHALL use a dashboard shell with persistent navigation, page header, and content area.

#### Scenario: User opens dashboard on desktop
- **WHEN** a logged-in user opens the dashboard on a desktop viewport
- **THEN** the page shows an RTL sidebar, header area, current context, and primary next action

#### Scenario: User opens dashboard on mobile
- **WHEN** a logged-in user opens the dashboard on a mobile viewport
- **THEN** navigation remains available without overlapping the main content

### Requirement: Dashboard journey clarity
The user dashboard SHALL communicate current status, next action, admin note if present, and recovery path for blocked states.

#### Scenario: User has no application
- **WHEN** a logged-in user has no application
- **THEN** the dashboard explains the empty state and provides a clear start action

#### Scenario: Application is not editable
- **WHEN** a user's application is submitted, under review, accepted, or rejected
- **THEN** the dashboard explains the status and does not present editing as an available action

### Requirement: Responsive admin surfaces
Admin dashboards and submission tables SHALL remain usable on desktop and mobile viewports.

#### Scenario: Admin views submissions on mobile
- **WHEN** an admin opens the submissions table on a narrow viewport
- **THEN** filters, export controls, and rows remain readable and operable
