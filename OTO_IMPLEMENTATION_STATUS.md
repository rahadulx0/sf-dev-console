# Org-to-org architecture implementation status

This matrix audits `oto-arch.md` against the local application. It distinguishes workflow
features from similarly named standalone utilities.

| Plan area | Status | Implementation / remaining work |
| --- | --- | --- |
| CLI adapter and safety constraints | Implemented | Central `CliRunner`, JSON output, concurrency, cancellation, timeouts, no token storage |
| Authenticated org manager | Implemented | Local CLI org list, selection, details, authorization and open-org actions |
| Metadata explorer and filtering | Implemented | Lazy type/component discovery, independent searches, presets, saved selections |
| Filesystem comparison workspace | Implemented | Source/target retrievals, bounded comparison cache, automatic cleanup |
| Component/subcomponent indexing | Implemented | Bundles plus object children including fields, validation rules, record types, list views and field sets |
| Semantic XML normalization | Implemented | Canonical XML object/property hashing, whitespace normalization, ordered repeated elements preserved |
| Comparison statuses and filters | Implemented | New, changed, target-only, identical and unknown with type/status/text filtering |
| Side-by-side diff | Implemented | Aligned line diff, add/remove coloring, multi-file navigation and fullscreen mode |
| Selective deployment builder | Implemented | Reviewed component selection and scoped package construction |
| Field-level security inclusion | Implemented | CustomField comparisons retrieve and enforce related Profile/PermissionSet payloads |
| Explicit destructive changes | Implemented | Target-only items are ignored by default and require explicit selection; post-destructive manifest generated |
| Deployment preview | Implemented | Exact org-to-org package can be previewed with Salesforce CLI before execution |
| Validation and test levels | Implemented | Validate/deploy modes, specified/local/all test settings and typed confirmation |
| Deployment monitor and cancellation | Implemented | Async report polling, progress counts, errors, tests and cancellation |
| Quick deploy | Implemented | Successful org-to-org validation can be promoted with exact confirmation |
| Results and local history | Implemented | Component/test/coverage failures, raw output, device-local run history |
| Dependency engine | Partial | Apex, LWC and CustomField reference scanning plus FLS; Flow, Layout, FlexiPage and object relationship parsers remain |
| Problem analyzer | Partial | Missing dependency and target-read warnings exist; a registry of deterministic rules and fixes remains |
| Permission visualizer/merge engine | Partial | FLS payload inclusion exists; permission-entry comparison and selective XML merge remain |
| Deployment order planner | Missing | Current deployment is one scoped package; staged dependency tiers remain |
| Rollback snapshots | Missing | Comparison retains target files temporarily, but durable pre-deploy backup and rollback manifests remain |
| Saved comparison packages | Missing | Local run history exists; reusable comparison artifacts are not yet persisted across restarts |
| Explicit exclusions | Honored | No data/CPQ migration, hosted CI/CD, shared cloud history, RBAC, approvals or cloud backups |

## Next implementation order

1. Expand deterministic dependency parsers and problem rules.
2. Add permission-entry visualization and safe merge artifacts.
3. Add deployment staging/order recommendations.
4. Persist target snapshots and generate rollback package/destructive manifests.
5. Persist reusable comparison/deployment packages on the local filesystem.
