# Facilities M9 monitoring contract

This is a reviewable contract, not an installed alert integration. G0 must name the
destination, primary/backup responders, acknowledgement/escalation times, and release
coverage. G2 requires a received test alert from the real destination.

## Required signals

| Signal | Proposed gate | Required response |
| --- | --- | --- |
| Reconciler exit `1` or readiness nonzero | Page immediately | Hold enablement/expansion; inspect fixed reason codes and safe counts. |
| No `last-reconcile-success` for 10 minutes | Page | Check scheduler, lock skips, DB, storage, and scanner. |
| Repeated exit `2` lock skips | Investigate using approved count/window | Confirm the previous job and 300-second advisory-lock horizon; never count a skip as completion. |
| Eligible backlog after exit `0` | Continue/observe | A 100-row batch completed; prove later runs make progress before saying the backlog drained. |
| Any unavailable object at/over 24 hours or due/aged deletion | Page/block | Keep programme unavailable or hold expansion and reconcile safely. |
| Scanner unavailable, malware test missed, or signatures older than approved age | Page/block | Fail closed; restore scanner/update health before enablement. |
| Free bytes/inodes below approved warning or critical threshold | Warn/page | Critical must occur before the readiness 2 GiB floor. Close new intake if required. |
| Backup older than approved RPO | Page/block | Refresh the matched recoverable set before affected production gates. |
| Payment verification failure/uncertainty or duplicate invariant | Page | Preserve callbacks and reconcile with the provider; never infer success from browser state. |
| Correction SMS `PENDING`/`FAILED` older than approved SLA | Alert | Core `NEEDS_EDIT` state remains; use the explicit safe retry. |
| Legacy route error/latency regression | Page/rollback | Preserve legacy access and callbacks; use rehearsed containment. |

Metrics/log transport must contain only timestamps, counts, durations, fixed reason
codes, candidate/config identities, and opaque record IDs where operationally required.
It must not contain mobile numbers, names, filenames, storage paths, hashes, document
content, payment credentials, provider payloads, session data, or backup contents.
