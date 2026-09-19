# Focused Phase 1 browser QA inventory

Local production server, restricted PostgreSQL role, seeded synthetic owned application.
Signed synthetic session only; login flow belongs to Phase18. All external browser requests
blocked or fulfilled locally; server gateway/SMS credentials blank. No actual payment.

- 390px mobile and 1440px desktop: approved uncertainty copy, RTL readability,
  existing design-system notice/button, no horizontal overflow.
- Click status check, verify one payment remains; loading completes with actionable
  Persian response, refresh preserves uncertainty rather than showing a new-charge path.
- Forged success URL remains pending from owned DB state.
- PAYABLE state labels its action as continuing the same saved payment; click must
  route to exactly the original authority (intercepted before external network).
- Signed-out return has neutral copy and no payment assertion.
- Owned old failed attempt with a settled obligation: render unit regression covers
  paid precedence independently of URL query.
- Facilities pending control and copy: render/integration tests; programme not enabled
  for browser navigation. Payment readiness/scanner/full journey remain later phases.
