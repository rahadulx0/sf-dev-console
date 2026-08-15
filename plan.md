**The Salesforce CLI remains the engine. Your application becomes the GUI.**

Salesforce CLI already provides JSON-capable commands for listing locally authenticated orgs, discovering metadata types/components, generating manifests, retrieving metadata, querying data, running Apex, and running tests. ([Developer][1])

# 1. Project concept

Working name:

**SF Dev Console**

Primary workflow:

```text
Open SF Dev Console
      ↓
Detect Salesforce CLI
      ↓
Load locally authorized orgs
      ↓
Select an Org
      ↓
Developer Dashboard
      ↓
┌─────────────────────────────────────┐
│ Metadata Explorer                   │
│ SOQL Query                          │
│ Anonymous Apex                      │
│ Apex Tests                          │
│ Debug Logs                          │
│ Org Information                     │
│ Limits                              │
│ Deployment Tools                    │
│ Data Tools                          │
└─────────────────────────────────────┘
```

The application should **not require the user to log into Salesforce again** if the org is already authorized locally. `sf org list` exposes orgs that have already been authenticated or created locally. ([Developer][1])

---

# 2. Recommended architecture

I recommend this structure:

```text
┌─────────────────────────────────────────┐
│               React UI                  │
│                                         │
│ Org Selector                            │
│ Metadata Explorer                       │
│ Manifest Builder                        │
│ Query Console                           │
│ Apex Console                            │
│ Test Runner                             │
│ Logs                                    │
└───────────────────┬─────────────────────┘
                    │ HTTP / WebSocket
                    ▼
┌─────────────────────────────────────────┐
│          Local Node.js Backend           │
│                                         │
│ OrgService                              │
│ MetadataService                         │
│ ManifestService                         │
│ RetrieveService                         │
│ QueryService                            │
│ ApexService                             │
│ TestService                             │
│ CliRunner                               │
│ JobManager                              │
└───────────────────┬─────────────────────┘
                    │ child_process.spawn()
                    ▼
┌─────────────────────────────────────────┐
│          Salesforce CLI (`sf`)           │
└───────────────────┬─────────────────────┘
                    │
                    ▼
              Salesforce Org
```

### Recommended stack

```text
Frontend
React
TypeScript
Vite
Tailwind CSS
shadcn/ui
Monaco Editor

Backend
Node.js
TypeScript
Fastify

Local storage
SQLite or JSON initially

CLI Execution
Node child_process.spawn()

Communication
REST API
WebSocket/SSE for long jobs
```

I would keep frontend and backend separated even though it is a localhost application. It will make a later conversion to **Tauri or Electron** much easier.

---

# 3. Startup screen

The first screen should perform environment validation.

```text
SF Dev Console

Environment

✓ Node.js detected
✓ Salesforce CLI detected
✓ Salesforce CLI authenticated orgs detected

Salesforce CLI
Version: x.x.x

[ Continue ]
```

Check something equivalent to:

```bash
sf --version
```

If Salesforce CLI isn't available:

```text
Salesforce CLI Not Found

SF Dev Console requires Salesforce CLI.

[ Installation Instructions ]
[ Retry ]
```

Do not make the application manage Salesforce authentication internally in V1.

---

# 4. Org selector

After startup:

```text
Select Salesforce Org

Search orgs...

┌──────────────────────────────────────────────┐
│ DEV                                          │
│ john@example.com                             │
│ Sandbox                                      │
│ Connected                                    │
│                                  [ Select ]  │
├──────────────────────────────────────────────┤
│ UAT                                          │
│ john@example.com.uat                         │
│ Sandbox                                      │
│ Connected                                    │
│                                  [ Select ]  │
├──────────────────────────────────────────────┤
│ Production                                   │
│ admin@example.com                            │
│ Production                                   │
│ Connected                                    │
│                                  [ Select ]  │
└──────────────────────────────────────────────┘
```

Backend:

```bash
sf org list --json
```

`sf org list` is specifically intended to return orgs you've created or authenticated to and supports JSON output. ([Developer][1])

Store the selected org only as:

```ts
{
  alias: "dev",
  username: "john@example.com",
  orgId: "...",
  instanceUrl: "...",
  isSandbox: true
}
```

Do **not** send Salesforce access tokens to the frontend.

---

# 5. Main dashboard

After selecting an org:

```text
DEV                                     Connected
john@example.com

Quick Actions

[ Metadata Explorer ]
[ SOQL Query ]
[ Anonymous Apex ]
[ Run Tests ]
[ Debug Logs ]
[ Open Org ]
[ Org Limits ]
[ Deploy Metadata ]

Recent Activities

Retrieved 27 metadata components
Executed SOQL query
Ran 14 Apex tests
```

Left navigation:

```text
Overview

ORG
  Org Information
  Org Limits
  Open Salesforce

METADATA
  Metadata Explorer
  Saved Manifests
  Retrieval History
  Deployments

DEVELOPMENT
  SOQL
  Anonymous Apex
  Apex Tests
  Debug Logs

DATA
  Record Inspector
  Import / Export

TOOLS
  Packages
  Settings
```

---

# 6. Metadata Explorer

This should be the flagship feature.

UI:

```text
Metadata Explorer

DEV

Search metadata...

Popular
────────────────────────

☐ Apex Classes
☐ Apex Triggers
☐ Lightning Web Components
☐ Aura Components
☐ Flows
☐ Custom Objects
☐ Custom Metadata
☐ Custom Labels
☐ Permission Sets
☐ Profiles
☐ Layouts
☐ Lightning Pages
☐ Static Resources

All Metadata Types
────────────────────────

> ApexClass
> ApexTrigger
> AuraDefinitionBundle
> CustomApplication
> CustomLabels
> CustomMetadata
> CustomObject
> EmailTemplate
> FlexiPage
> Flow
> Layout
> LightningComponentBundle
> PermissionSet
> Profile
> Report
> StaticResource
...
```

Get available metadata types using:

```bash
sf org list metadata-types \
  --target-org dev \
  --json
```

Salesforce documents this command specifically for discovering the metadata types enabled for an org. ([Developer][2])

---

# 7. Lazy-load metadata components

Do **not** load every metadata component when the page opens.

That will make large orgs unnecessarily slow.

Instead:

```text
> ApexClass
```

User expands it:

```text
v ApexClass

Search Apex Classes...

☐ AccountController
☐ AccountService
☐ ContactController
☐ ContactTriggerHandler
☐ OpportunityService
☐ QuoteService

[ Select All ]
```

Backend runs:

```bash
sf org list metadata \
  --metadata-type ApexClass \
  --target-org dev \
  --json
```

Salesforce provides `org list metadata` specifically for listing individual components of a metadata type. ([Developer][3])

This is important because it allows:

```text
Type
   ↓
Component
```

rather than forcing developers to remember API names.

---

# 8. Metadata selection basket

Have a persistent selection panel.

Example:

```text
Selected Metadata                       24

ApexClass                               8
LightningComponentBundle               4
CustomObject                            3
Flow                                    5
PermissionSet                           4

[ Clear ]

[ Review Selection ]
```

Users should be able to select either:

```text
ApexClass:*
```

or specific components:

```text
ApexClass:AccountController
ApexClass:QuoteService
```

This saves enormous amounts of repetitive CLI typing.

---

# 9. Developer presets

This will make the tool significantly faster than manually browsing metadata.

Add preset buttons.

### Apex

```text
ApexClass
ApexTrigger
ApexTestSuite
```

### Frontend

```text
LightningComponentBundle
AuraDefinitionBundle
FlexiPage
StaticResource
```

### Automation

```text
Flow
Workflow
ApprovalProcess
```

### Security

```text
Profile
PermissionSet
PermissionSetGroup
CustomPermission
```

### Object Configuration

```text
CustomObject
Layout
RecordType
CustomTab
```

### Everything

```text
Full Org
```

UI:

```text
Quick Select

[ Apex ]
[ LWC / Aura ]
[ Objects ]
[ Automation ]
[ Security ]
[ Full Org ]
```

---

# 10. Manifest Builder

After selection:

```text
Review Metadata

ApexClass
  ✓ AccountController
  ✓ AccountService
  ✓ QuoteService

LightningComponentBundle
  ✓ accountManager
  ✓ quoteBuilder

CustomObject
  ✓ Account
  ✓ Quote__c

API Version
[ 65.0 ▼ ]

[ Preview package.xml ]

[ Retrieve ]
```

The application should internally generate:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>AccountController</members>
        <members>AccountService</members>
        <members>QuoteService</members>
        <name>ApexClass</name>
    </types>
    <types>
        <members>accountManager</members>
        <members>quoteBuilder</members>
        <name>LightningComponentBundle</name>
    </types>
    <types>
        <members>Account</members>
        <members>Quote__c</members>
        <name>CustomObject</name>
    </types>
    <version>65.0</version>
</Package>
```

You can either build this XML yourself or use Salesforce's manifest-generation functionality. Salesforce CLI officially supports generating `package.xml` manifests from component selections or directly from an org. ([Developer][4])

---

# 11. Full Org mode

Add:

```text
Generate Full Org Manifest
```

Backend:

```bash
sf project generate manifest \
  --from-org dev \
  --output-dir manifest \
  --json
```

Salesforce supports building a manifest directly from the metadata in an org. Salesforce notes that this operation can make many concurrent API calls, so it should be treated as a heavier operation than normal component browsing. ([Developer][4])

UI:

```text
Full Org Retrieval

Include

✓ Unmanaged Metadata
☐ Managed Packages
☐ Unlocked Packages

Exclude

[ Reports ]
[ Dashboards ]
[ Email Templates ]
[ Profiles ]

[ Generate Manifest ]
```

This will be extremely useful for backups.

---

# 12. Retrieve screen

After clicking Retrieve:

```text
Retrieve Metadata

Format

○ Salesforce Source Format
● Metadata API Format

Output

● Download ZIP
○ Save to Folder

Filename

dev-metadata-2026-08-15.zip

[ Start Retrieval ]
```

Salesforce CLI supports both source-format retrieval and Metadata API-format retrieval. Using `--target-metadata-dir` causes Metadata API format to be retrieved and can produce a ZIP file. ([Developer][5])

For download ZIP:

```bash
sf project retrieve start \
  --manifest manifest/package.xml \
  --target-org dev \
  --target-metadata-dir output \
  --zip-file-name metadata.zip \
  --json
```

The retrieve command must execute inside a Salesforce DX project. ([Developer][5])

Therefore your application should maintain an internal workspace:

```text
~/.sf-dev-console/
    workspace/
        sfdx-project.json

        manifest/
            package.xml

        retrieve/
            ...

        temp/
            ...

        downloads/
            ...
```

Salesforce provides an empty Salesforce DX project template if you want your application to bootstrap this workspace through CLI rather than constructing it itself. ([Developer][6])

---

# 13. Retrieval job UX

Don't freeze the UI.

Use a job system.

```text
Retrieving Metadata

Preparing manifest
✓

Submitting retrieve request
✓

Retrieving metadata
████████████████░░░░

Converting metadata
...

Creating ZIP
...

27 metadata components retrieved
```

Then:

```text
Retrieval Complete

Components: 27
Files: 64
Size: 2.8 MB

[ Download ZIP ]
[ Open Folder ]
[ View Files ]
```

---

# 14. Retrieval history

Useful enough to put in V1.

```text
Retrieval History

DEV

Today 6:02 PM
24 components
Apex + LWC
[ Download ] [ Repeat ]

Today 4:37 PM
146 components
Objects + Security
[ Download ] [ Repeat ]

Yesterday
Full Org
[ Download ] [ Repeat ]
```

Store only metadata such as:

```ts
interface Retrieval {
  id: string
  orgId: string
  orgAlias: string
  createdAt: string
  manifestPath: string
  outputPath: string
  componentCount: number
  status: "success" | "failed"
}
```

---

# 15. Saved metadata sets

This is another high-value feature.

Example:

```text
Saved Sets

[ CPQ Metadata ]
87 components

[ Quote Module ]
41 components

[ Security Config ]
126 components

[ LWC Only ]
29 components
```

Then:

```text
[ Retrieve Again ]
```

This eliminates repeatedly selecting the same metadata.

---

# 16. SOQL Console

Once metadata retrieval works, add the second major module.

UI:

```text
SOQL Query

DEV

┌──────────────────────────────────────────┐
│ SELECT Id, Name                         │
│ FROM Account                            │
│ WHERE CreatedDate = TODAY               │
│ LIMIT 100                               │
└──────────────────────────────────────────┘

[ Run ]

Results: 37

| Id | Name |
|----|------|
| ...| ABC  |
```

Underlying command:

```bash
sf data query \
  --query "SELECT Id, Name FROM Account LIMIT 100" \
  --target-org dev \
  --json
```

`sf data query` is Salesforce CLI's standard SOQL query command. Salesforce recommends bulk export instead for queries returning more than 10,000 records. ([Developer][7])

Add later:

```text
Save Query
Query History
CSV Export
JSON Export
Use Tooling API
```

---

# 17. Anonymous Apex

UI:

```text
Anonymous Apex

DEV

┌─────────────────────────────────────────────┐
│ Account a = new Account(Name='Test');       │
│ insert a;                                   │
│ System.debug(a.Id);                         │
└─────────────────────────────────────────────┘

[ Execute ]

Result

SUCCESS

Debug Output
...
```

Backend maps this to Salesforce CLI's anonymous Apex execution capability. ([Developer][8])

Monaco Editor is particularly suitable here because you can eventually add:

```text
syntax highlighting
autocomplete
saved scripts
execution history
```

---

# 18. Apex test runner

UI:

```text
Apex Tests

Search classes...

☐ AccountServiceTest
☐ QuoteServiceTest
☐ OrderServiceTest

Test Level

○ Run Local Tests
● Run Specified Tests
○ Run All Tests

✓ Include Code Coverage

[ Run Tests ]
```

Results:

```text
Tests                         43
Passed                        41
Failed                         2

Coverage                      84%

Failures

QuoteServiceTest
  testCreateQuote

Expected: 4
Actual: 3
```

Salesforce CLI supports running specified classes/tests or broader test levels, as well as later retrieving asynchronous results and code coverage. ([Developer][9])

---

# 19. Debug log viewer

Page:

```text
Debug Logs

DEV

User                  Time          Size
John Doe              18:04         1.8 MB
Integration User      17:55         740 KB
John Doe              17:42         2.1 MB

[ View ]
[ Download ]
```

Salesforce CLI provides commands for listing debug logs and retrieving individual logs. ([Developer][10])

Later add:

```text
Execution tree
Filter USER_DEBUG
Filter SOQL
Filter DML
Filter exceptions
Execution time breakdown
```

That could eventually become one of the strongest features of the application.

---

# 20. Org utilities

Add a small utility section:

```text
Org

DEV
Sandbox
Connected

Organization ID
00D...

Username
...

Instance
...

[ Open Salesforce ]
[ View Limits ]
[ Refresh Connection ]
```

Salesforce CLI provides org information, opening an org in the browser, and limit-related commands. ([Developer][11])

Do not expose the output of `sf org display --verbose` to the browser. Salesforce warns that verbose org information can include sensitive authorization information such as an SFDX auth URL containing a refresh token. ([Developer][11])

---

# 21. Deployment module

Do this **after retrieval is stable**.

UI:

```text
Deploy Metadata

Source

[ Select Folder ]
[ Select ZIP ]
[ Select package.xml ]

Target Org

UAT

Deployment Type

○ Validate Only
● Deploy

Test Level

[ Run Local Tests ▼ ]

[ Preview Deployment ]

[ Deploy ]
```

Salesforce CLI supports deployment, validation, and deployment previews. ([Developer][12])

You should intentionally keep deployment outside the first MVP because retrieval is read-oriented while deployment changes an org. The safety requirements and UX are substantially different.

---

# 22. Org-to-org metadata comparison

This should be a later flagship feature.

Example:

```text
Compare Orgs

Source
[ DEV ]

Target
[ UAT ]

Metadata
[ Apex + LWC + Flows ]

[ Compare ]
```

Result:

```text
AccountService

DEV            UAT
─────────────────────────
Modified       Different


QuoteService
─────────────────────────
Same


NewController
─────────────────────────
DEV only
```

Then:

```text
[ View Diff ]
[ Retrieve DEV ]
[ Retrieve UAT ]
[ Add to Deployment ]
```

This would move the application beyond being merely a CLI wrapper.

---

# 23. Backend API design

I would expose backend endpoints approximately like this:

```text
GET    /api/system/status

GET    /api/orgs
POST   /api/orgs/select
GET    /api/orgs/:org/info
POST   /api/orgs/:org/open

GET    /api/orgs/:org/metadata/types
GET    /api/orgs/:org/metadata/:type

POST   /api/manifests
GET    /api/manifests/:id
POST   /api/manifests/:id/retrieve

GET    /api/retrievals
GET    /api/retrievals/:id
GET    /api/retrievals/:id/download

POST   /api/query

POST   /api/apex/execute

POST   /api/tests
GET    /api/tests/:id

GET    /api/logs
GET    /api/logs/:id
```

---

# 24. Backend folder structure

I would structure the repository like this:

```text
sf-dev-console/
│
├── client/
│   ├── src/
│   │   │   ├── components/
│   │   │   ├── features/
│   │   │   │   ├── orgs/
│   │   │   │   ├── metadata/
│   │   │   │   ├── manifests/
│   │   │   │   ├── retrieval/
│   │   │   │   ├── query/
│   │   │   │   ├── apex/
│   │   │   │   ├── tests/
│   │   │   │   └── logs/
│   │   │   ├── pages/
│   │   │   ├── hooks/
│   │   │   ├── api/
│   │   │   └── types/
│
├── server/
│   ├── src/
│       │   ├── modules/
│       │   │   ├── org/
│       │   │   ├── metadata/
│       │   │   ├── manifest/
│       │   │   ├── retrieval/
│       │   │   ├── query/
│       │   │   ├── apex/
│       │   │   ├── tests/
│       │   │   └── logs/
│       │   │
│       │   ├── cli/
│       │   │   ├── CliRunner.ts
│       │   │   ├── CliCommand.ts
│       │   │   └── CliResult.ts
│       │   │
│       │   ├── jobs/
│       │   ├── storage/
│       │   └── server.ts
│
├── packages/
│   ├── shared/
│   └── ui/
│
├── package.json
└── README.md
```

---

# 25. Most important backend class

Do **not** scatter CLI execution throughout controllers.

Everything should go through:

```text
CliRunner
```

Conceptually:

```ts
CliRunner.execute({
    command: "org:list",
    args: [...]
})
```

Internally map that to:

```text
sf org list --json
```

Other modules should never directly execute arbitrary terminal strings.

Architecture:

```text
OrgService
       \
MetadataService
        \
QueryService -----> CliRunner -----> sf
        /
ApexService
       /
TestService
```

This gives you one place for:

```text
argument validation
JSON parsing
timeouts
logging
cancellation
error normalization
process management
```

---

# 26. Security requirement

This part is non-negotiable.

Never implement:

```ts
exec(`sf ${userCommand}`)
```

and never expose:

```text
POST /api/terminal
{
   "command": "anything"
}
```

That turns your application into arbitrary command execution.

Instead:

```text
UI request
   ↓
Known backend operation
   ↓
Validated parameters
   ↓
Known CLI command
```

For example:

```text
retrieveMetadata()
```

may execute only:

```text
sf project retrieve start ...
```

Use process arguments rather than shell concatenation:

```text
spawn(
    "sf",
    [
        "project",
        "retrieve",
        "start",
        "--manifest",
        manifestPath,
        "--target-org",
        orgAlias,
        "--json"
    ],
    {
        shell: false
    }
)
```

Also bind the local backend to:

```text
127.0.0.1
```

rather than exposing it to the local network.

---

# 27. CLI mapping layer

Your application should effectively maintain this translation:

| GUI Action           | Salesforce CLI                 |
| -------------------- | ------------------------------ |
| List authorized orgs | `sf org list --json`           |
| Org information      | `sf org display`               |
| Open org             | `sf org open`                  |
| Metadata types       | `sf org list metadata-types`   |
| Metadata components  | `sf org list metadata`         |
| Generate manifest    | `sf project generate manifest` |
| Retrieve             | `sf project retrieve start`    |
| SOQL                 | `sf data query`                |
| Anonymous Apex       | `sf apex run`                  |
| Apex tests           | `sf apex run test`             |
| Test results         | `sf apex get test`             |
| Debug logs           | `sf apex list log`             |
| Deploy               | `sf project deploy start`      |

These command families are all exposed in Salesforce's current CLI reference. ([Developer][13])

---

# 28. Development milestones

I would build it in this order.

### Milestone 1 — Local foundation

Build:

```text
React UI
Node backend
CliRunner
CLI availability check
Internal workspace
Basic application shell
```

Do not move forward until CLI commands execute predictably and JSON errors are normalized.

### Milestone 2 — Org Manager

Build:

```text
List authorized orgs
Search org
Select org
Remember last org
Org information
Open org
Connection status
```

At this point:

```text
Open app → choose org
```

must feel instant.

### Milestone 3 — Metadata Explorer

Build:

```text
Metadata type discovery
Popular metadata categories
Lazy component loading
Search
Select all
Individual selection
Selection basket
```

This is your first serious usable version.

### Milestone 4 — Manifest Builder

Build:

```text
Generate package.xml
Preview XML
Edit selection
API version selector
Save manifest
Saved metadata presets
```

### Milestone 5 — Metadata Retrieval

Build:

```text
Retrieve source
Retrieve Metadata API format
ZIP creation
Download
Progress
Errors
Cancellation
Retrieval history
Repeat retrieval
```

At this milestone, the **core product is complete**.

### Milestone 6 — Developer Console

Add:

```text
SOQL Query
Query history
Anonymous Apex
Saved Apex snippets
Apex tests
Coverage
Debug logs
Org limits
```

Now it becomes an everyday Salesforce developer utility.

### Milestone 7 — Deployment

Add:

```text
Deployment preview
Validation
Deployment
Test levels
Deployment status
Deployment history
```

### Milestone 8 — Advanced tooling

Add:

```text
Org-to-org comparison
Metadata diff
Dependency analysis
Git integration
Package viewer
Permission analysis
Bulk data import/export
Record inspector
Metadata search across types
```

---

# 29. V1 scope I recommend

Do **not** try to implement the entire Salesforce CLI initially.

Your first release should contain exactly these high-value functions:

```text
1. Detect Salesforce CLI

2. Select locally authenticated org

3. View org information

4. Open org

5. Browse metadata types

6. Browse metadata components

7. Search metadata

8. Select individual metadata

9. Select entire metadata type

10. Developer presets

11. Generate package.xml

12. Preview package.xml

13. Retrieve metadata

14. Download ZIP

15. Save metadata selection

16. Retrieval history

17. Repeat previous retrieval

18. SOQL Console

19. Anonymous Apex

20. Apex Test Runner
```

That is already enough to make the application useful every day.

---

# 30. Final UX

The end result should feel like this:

```text
SF Dev Console
────────────────────────────────────────────────────

DEV ▼

Metadata Explorer

Search...
───────────────────────────────────────

Quick Select

[Apex] [LWC] [Objects] [Flows] [Security] [Full Org]


Metadata

▼ ApexClass                         124
    ☑ AccountService
    ☑ AccountController
    ☐ ContactService
    ☑ QuoteService

▼ LightningComponentBundle          43
    ☑ accountManager
    ☐ contactManager
    ☑ quoteBuilder

> Flow                              87
> CustomObject                     142
> PermissionSet                     64
> Profile                           18


──────────────────────────────────────────────

Selected                         5 components

ApexClass                        3
LightningComponentBundle        2

[ Save Selection ]

              [ Preview package.xml ]
              [ Retrieve Metadata ]
```

Then one click:

```text
Retrieve Metadata
        ↓
Salesforce CLI
        ↓
Metadata API
        ↓
ZIP generated
        ↓
Download
```

That is the correct foundation, Sir.

The main mistake would be trying to create a visual wrapper for **every Salesforce CLI command** from the start. Build around **developer workflows**, not commands. Metadata selection/retrieval should be the core; SOQL, Apex, tests, logs, deployment, comparison, and data utilities should plug into the same `CliRunner` architecture afterward. This gives you one application that can realistically replace a large percentage of the repetitive CLI work you currently perform.

[1]: https://developer.salesforce.com/docs/platform/salesforce-cli-reference/guide/cli_reference_org_list.html "org list | org Commands | Salesforce CLI Command Reference | Salesforce Developers"
[2]: https://developer.salesforce.com/docs/platform/salesforce-cli-reference/guide/cli_reference_org_list_metadata-types.html "org list metadata-types | org Commands | Salesforce CLI Command Reference | Salesforce Developers"
[3]: https://developer.salesforce.com/docs/platform/salesforce-cli-reference/guide/cli_reference_org_list_metadata.html "org list metadata | org Commands | Salesforce CLI Command Reference | Salesforce Developers"
[4]: https://developer.salesforce.com/docs/platform/salesforce-cli-reference/guide/cli_reference_project_generate_manifest.html "project generate manifest | project Commands | Salesforce CLI Command Reference | Salesforce Developers"
[5]: https://developer.salesforce.com/docs/platform/salesforce-cli-reference/guide/cli_reference_project_retrieve_start.html "project retrieve start | project Commands | Salesforce CLI Command Reference | Salesforce Developers"
[6]: https://developer.salesforce.com/docs/platform/salesforce-cli-reference/guide/cli_reference_template_generate_project.html?utm_source=chatgpt.com "template generate project"
[7]: https://developer.salesforce.com/docs/platform/salesforce-cli-reference/guide/cli_reference_data_query.html?utm_source=chatgpt.com "data query | data Commands"
[8]: https://developer.salesforce.com/docs/platform/salesforce-cli-reference/guide/cli_reference_apex_run.html?utm_source=chatgpt.com "apex run | apex Commands"
[9]: https://developer.salesforce.com/docs/platform/salesforce-cli-reference/guide/cli_reference_apex_run_test.html?utm_source=chatgpt.com "apex run test"
[10]: https://developer.salesforce.com/docs/platform/salesforce-cli-reference/guide/cli_reference_apex_list_log.html?utm_source=chatgpt.com "apex list log"
[11]: https://developer.salesforce.com/docs/platform/salesforce-cli-reference/guide/cli_reference_org_display.html?utm_source=chatgpt.com "org display | org Commands | Salesforce CLI ..."
[12]: https://developer.salesforce.com/docs/platform/salesforce-cli-reference/guide/cli_reference_project_deploy_start.html?utm_source=chatgpt.com "project deploy start | project Commands"
[13]: https://developer.salesforce.com/docs/platform/salesforce-cli-reference/guide/cli_reference_org.html?utm_source=chatgpt.com "org Commands | Salesforce CLI Command Reference"
