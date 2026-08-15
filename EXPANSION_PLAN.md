# SF Dev Console — Expanded Product Plan

SF Dev Console should cover Salesforce developer workflows rather than mirror every CLI command. Every operation remains a fixed, validated backend action executed through `CliRunner`; there will never be an arbitrary terminal endpoint.

## Current release — Developer Workbench

### Environment and orgs

- Detect Node.js and Salesforce CLI
- Load locally authorized scratch, sandbox, and production orgs
- Remember the selected org locally
- Show safe org information and open Salesforce
- Display API limits and remaining capacity
- List installed managed and unlocked packages

### Metadata and releases

- Discover metadata types and lazy-load components
- Search, presets, wildcard selection, and selection basket
- Save reusable metadata sets
- Generate and preview `package.xml`
- Retrieve Metadata API ZIP files asynchronously
- Store retrieval history locally and download completed ZIP files
- Preview deployments from a local Salesforce project
- Run check-only deployment validation with tests

### Development and diagnostics

- SOQL and Tooling API query support
- Tabular query results and CSV export
- Inspect a record and all returned fields by SObject and ID
- Execute anonymous Apex
- Run local, all-org, or specified Apex tests with coverage
- List and inspect Apex debug logs

## Phase 2 — Daily developer productivity

- Object describe browser: fields, relationships, picklists, and record types
- Query tabs, saved queries, history, autocomplete, and query plans
- Anonymous Apex snippets and execution history
- Apex test class discovery, structured failures, coverage visualization, and reruns
- Debug-log filters for `USER_DEBUG`, SOQL, DML, exceptions, and execution timing
- Org browser for users, permission sets, profiles, queues, and public groups
- Bulk query/export for datasets larger than 10,000 records
- CSV import wizard with mapping, validation, and error downloads
- Source-format retrieval to a selected local Salesforce project

## Phase 3 — Release management

- Deploy only after a successful validation, with explicit confirmation
- Quick deploy using a validated job ID
- Deployment status, component failures, test failures, and local history
- Destructive-changes review requiring a second confirmation
- Org-to-org metadata inventory and source comparison
- Side-by-side file diff and selective promotion basket
- Source tracking status, pull/push conflict review, and ignored-file explanations
- Package version creation, promotion, installation, and dependency viewer

## Phase 4 — Administration and observability

- Trace-flag creation and expiry management
- Real-time log tailing and log performance visualization
- Async Apex jobs, scheduled jobs, platform events, and event monitoring
- User permission analysis and “why can this user access this?” explanations
- Permission-set comparison and least-privilege recommendations
- Scratch-org creation, snapshots, sandbox lifecycle, and org logout management
- Data anonymization recipes for sandbox refresh workflows

## Phase 5 — Advanced local tooling

- Multiple local project workspaces and recent-project launcher
- Git-aware metadata change summaries
- Dependency analysis and impact graph
- Local metadata full-text search
- Plugin architecture for additional allow-listed CLI workflows
- Optional Tauri packaging while retaining the same local Node/CLI model

## Safety levels

| Level | Examples | UX requirement |
| --- | --- | --- |
| Read-only | org info, metadata browse, query, logs, limits | Immediate execution |
| Local-write | manifests, retrieve ZIP, CSV export | Show destination and result |
| Org validation | deploy preview, validate, Apex tests | Clear target org and progress |
| Org mutation | Apex execution, data import, deploy | Explicit target, impact summary, confirmation |
| Destructive | data delete, destructive metadata | Typed confirmation and recoverability warning |

Access tokens, refresh tokens, SFDX authorization URLs, and verbose org-display output must never be returned to the browser or written to application state.

