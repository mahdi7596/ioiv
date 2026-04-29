## ADDED Requirements

### Requirement: Design tokens applied
The application SHALL apply the visual direction in `DESIGN.md` for primary color, secondary color, surfaces, border radius, density, and typography.

#### Scenario: User views public login
- **WHEN** a user opens the public login page
- **THEN** the page uses IRANYekan, the approved color tokens, warm surface treatment, and minimal styling

### Requirement: Pure CSS styling direction
New polished UI surfaces SHALL use semantic CSS or CSS Modules rather than adding more utility-heavy component styling.

#### Scenario: Developer updates dashboard shell
- **WHEN** dashboard shell components are implemented
- **THEN** styling is organized around semantic classes and design tokens

### Requirement: Accessible motion
The application SHALL use subtle motion for step changes and error states while respecting reduced-motion preferences.

#### Scenario: User changes wizard step
- **WHEN** reduced motion is not requested and the user changes steps
- **THEN** the new step appears with a short subtle transition

#### Scenario: User prefers reduced motion
- **WHEN** the user's system requests reduced motion
- **THEN** non-essential step and error animations are disabled
