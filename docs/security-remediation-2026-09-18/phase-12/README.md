# Phase 12 replay

Use only a task-labelled disposable local PostgreSQL database and copied source without
project .env files. environment.json records this completed run; setup.py creates a new one.
Run setup.py, run.py sync, migrate.py, then use run.py with a log filename and the desired
prisma generate / next typegen / vitest run / tsc --noEmit / eslint / next build command.
Run migration-rehearsal.py for the isolated rollback fixture. Run the browser harness
prisma/tests/admin-review/browser.ts through tsx after a successful build; it requires the
bundled Playwright path and screenshot directory supplied by setup.py. checkpoint.py
compares tested/root source and checks migration checksums and restricted privileges.
Shut down only owned processes and the matching labelled container before sealing evidence.
See results.md and qa-inventory.md for scope and limits. Prior evidence remains immutable.
