# Phase 14 dependency and image qualification

Refresh npm advisories from registry and primary project security releases. Compatible
transitive fixes plus scoped @prisma/config deepmerge-ts8 override (plain trusted config;
qualify generate/migration). Keep Prisma client/CLI aligned6.19.3, no blind downgrade.
Update tsx within4.x to use patched esbuild rather than audit-suggested downgrade.
Generate native Prisma engines from locked dependencies inside builder and maintenance;
exclude stale exported binaries. Pin official Node22 Alpine manifest digest and use its
matching upstream APK repositories. Runner remains unprivileged without Prisma CLI/config.
Build exact runner/maintenance, inspect physical contents/engine identity, exercise actual
restricted DB and maintenance migrations, scan each separately, then regressions/build.
No schema or data retention change. No deployment. Unaccepted runtime high/critical or
unavailable image evidence remains a release blocker; do not claim npm audit as OS scan.
