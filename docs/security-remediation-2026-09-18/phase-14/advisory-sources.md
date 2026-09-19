# Refreshed primary sources — 2026-09-19

- npm registry audit endpoint: npm-audit-initial.json (not prior cached report).
- Next.js [August security release](https://nextjs.org/blog/august-2026-security-release):
  installed16.3.3 already meets this advisory's fixed release.
- [Deepmerge maintainer advisory](https://github.com/RebeccaStevens/deepmerge-ts/security/advisories/GHSA-ggr8-5vv4-36mx)
  and [8.0.0 release](https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.0):
  recursive-object crash fixed; Map semantics changed. Scoped config override requires CLI
  compatibility tests. Three npm package entries are one advisory chain, not three exploits.
- [Prisma upstream issue](https://github.com/prisma/orm/issues/30052) supports investigating
  config-loader reachability; our installed call site independently uses developer config.
- [Brace expansion](https://github.com/advisories/GHSA-rgw5-rvv9-x895),
  [JS-YAML](https://github.com/advisories/GHSA-2883-xcg3-v3hh),
  [Browserslist](https://github.com/advisories/GHSA-c83g-rgw3-j3cx): refreshed transitive fixes.

Registry findings and actual OS/image scan are separate evidence. No claim that zero npm
findings proves an image free of vulnerability. Docker Scout required authentication;
use checksum-verified official Trivy release locally instead, without changing login state.
