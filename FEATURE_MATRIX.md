# Implemented Feature Verification Matrix

This matrix maps the requested twenty-feature MVP to the actual website surface, backend route, Salesforce CLI operation, and verification performed on 2026-08-15.

| # | Capability | Website | Backend / CLI | Verification |
|---:|---|---|---|---|
| 1 | Local Authorized Org Selector | Startup and sidebar org selector | `GET /api/orgs` → `sf org list --json` | Live CLI response |
| 2 | Org Information Dashboard | Org Information | `GET /api/orgs/:org/info` → `sf org display` | Route/build verified; sensitive verbose output excluded |
| 3 | Metadata Type Browser | Metadata Explorer | `sf org list metadata-types` | Existing live workflow |
| 4 | Metadata Component Browser | Expandable lazy-loaded type rows | `sf org list metadata` | Existing live workflow |
| 5 | Multi-select Metadata | Basket, wildcard type selection, presets | Local React state and device storage | Type-check/build verified |
| 6 | Retrieve Metadata | Metadata selection retrieval | `sf project retrieve start --manifest` | Async job route verified |
| 7 | Download Metadata ZIP | Retrieval History | `--target-metadata-dir --zip-file-name` | Download route/build verified |
| 8 | package.xml Generator | Preview package.xml modal | Local deterministic XML generator | Three automated tests |
| 9 | Upload package.xml | Existing package.xml panel | Validated local upload; manifest retrieval route | Live upload returned HTTP 200 |
| 10 | Deploy Metadata | Guarded Deployment Workbench | `sf project deploy start --async` | Command help and route/build verified; not executed against an org |
| 11 | Validate Deployment | Deployment Workbench | `sf project deploy validate` | Command help and route/build verified; not executed against an org |
| 12 | Deployment Results | Job ID status/quick/cancel controls | `deploy report`, `quick`, `cancel` | Command help and route/build verified; mutations not executed |
| 13 | SOQL Query Runner | Schema-aware fuzzy editor, object/field suggestions, Tab field expansion, paginated results, Excel copy, guarded row deletion | `sf data query`, `sf sobject describe`, `sf data delete record` | Query/build verified; invalid delete confirmation returned HTTP 400 without mutation |
| 14 | Object Explorer | Object catalog and schema field table | `sf sobject list`, `sf sobject describe` | Live HTTP 200; Account schema returned |
| 15 | Anonymous Apex | Anonymous Apex editor | `sf apex run` | Route/build verified; not executed to avoid org mutation |
| 16 | Apex Test Runner | Test level, classes, coverage | `sf apex run test` | Route/build verified; tests not triggered in an org |
| 17 | Debug Log Viewer | Debug Logs table and viewer | `sf apex list log`, `sf apex get log` | Route/build verified |
| 18 | Org Limits | Org Limits dashboard | `sf limits api display` | Live HTTP 200 against selected org |
| 19 | Record Counts | Multi-object selection and CSV export | Aggregate SOQL `SELECT count()` | Live Account and Contact counts returned |
| 20 | Command/Operation History | Operation History | Local response audit hook and JSON state | Live events returned from `/api/activities` |

## Additional implemented features

- Installed package inventory
- Record inspector
- Saved metadata selections
- Retrieval job history
- Metadata retrieval preview for source-tracked projects
- Deployment preview
- Quick deploy and deployment cancellation controls
- Capability catalog visible inside the application
- Client-side pagination for debug logs, installed packages, and query result sets
- Excel-compatible TSV copy for all or selected query rows
- Destructive DML confirmation and per-record deletion results
- Record Inspector edit mode with typed controls, updateable-field enforcement, refresh after save, and centered validation notifications
- Overview authorization dialog using `sf org login web` for Production/Developer and Sandbox logins, aliases, default orgs, and Dev Hubs

## Verification policy

Read-only operations were smoke-tested against the locally selected org. Mutating operations—Apex execution, deployment, quick deploy, and cancellation—were verified through CLI command discovery, strict type-checking, production build, fixed command mapping, and validation logic. They were deliberately not executed against a Salesforce org without an explicit user-selected target and confirmation.

Credential-returning features (`org display --verbose`, access tokens, and SFDX auth URLs) are intentionally not exposed to the browser.
