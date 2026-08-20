Gearset currently structures its core deployment experience around source/target selection, metadata filtering, comparison, dependency analysis, problem analysis, validation, and deployment. That is the part worth reproducing. ([Gearset Help Center][1])

# 1. Product Scope

Build a local application that provides:

```text
Authenticated Salesforce Orgs
            │
            ▼
    Source / Target Selection
            │
            ▼
       Metadata Browser
            │
            ▼
      Retrieve Metadata
       Source + Target
            │
            ▼
       Comparison Engine
            │
      ┌─────┴─────┐
      │           │
 Dependency    Problem
 Analyzer      Analyzer
      │           │
      └─────┬─────┘
            ▼
     Deployment Builder
            │
            ▼
     Deployment Preview
            │
            ▼
         Validate
            │
       ┌────┴────┐
       │         │
    Deploy    Quick Deploy
       │         │
       └────┬────┘
            ▼
      Results / Tests
```

Salesforce CLI remains responsible for all Salesforce communication.

Your application is responsible for:

* orchestration
* comparison
* XML parsing
* dependency analysis
* package construction
* UX
* error interpretation

That separation is critical.

---

# 2. Hard Architectural Constraints

I would define these constraints at the start of the project:

```text
Salesforce communication     → sf CLI only
Authentication               → existing Salesforce CLI authentication
Application database         → none
Metadata storage             → temporary/local filesystem
Deployment history DB        → none
Salesforce data modification → none except explicit metadata deployments
Secrets                      → never stored by application
Source org writes            → prohibited
Target org writes            → only explicit deployment/delete actions
```

The application should never extract Salesforce access tokens and store them itself.

For example, Salesforce CLI can already enumerate authenticated orgs and display org information. ([Developer][2])

---

# 3. Recommended Technical Architecture

For a local GUI application:

```text
┌─────────────────────────────────────────────────────┐
│                    Frontend                         │
│                                                     │
│ React / TypeScript                                  │
│                                                     │
│ Org Selector                                        │
│ Metadata Browser                                    │
│ Compare View                                        │
│ XML Diff Viewer                                     │
│ Dependency Tree                                     │
│ Deployment Builder                                  │
│ Validation Results                                  │
│ Deployment Results                                  │
└───────────────────────┬─────────────────────────────┘
                        │
                 Local IPC / HTTP
                        │
┌───────────────────────▼─────────────────────────────┐
│              Application Backend                    │
│                                                     │
│ Node.js / TypeScript                                │
│                                                     │
│ CLI Orchestrator                                    │
│ Workspace Manager                                   │
│ Metadata Service                                    │
│ Comparison Engine                                   │
│ Dependency Engine                                   │
│ Problem Analyzer                                    │
│ Manifest Builder                                    │
│ Deployment Engine                                   │
│ Apex Test Engine                                    │
│ Result Parser                                       │
└───────────────────────┬─────────────────────────────┘
                        │
                    spawn()
                        │
┌───────────────────────▼─────────────────────────────┐
│                 Salesforce CLI                      │
│                                                     │
│ sf org ...                                          │
│ sf project retrieve ...                             │
│ sf project deploy ...                               │
│ sf apex run test ...                                │
└───────────────────────┬─────────────────────────────┘
                        │
                        ▼
               Salesforce Orgs
```

For an existing locally hosted web project, the same architecture works. The browser must **not** execute `sf` directly. A local Node process must execute it.

---

# 4. CLI Adapter Layer

Create one centralized module:

```text
SalesforceCliService
```

Nothing else should execute shell commands.

It should expose application-level methods such as:

```text
getAuthenticatedOrgs()
getOrgDetails()
getMetadataTypes()
getMetadataComponents()
retrieveMetadata()
previewRetrieve()
generateManifest()
previewDeployment()
validateDeployment()
deploy()
quickDeploy()
cancelDeployment()
getDeploymentStatus()
resumeDeployment()
runApexTests()
getApexTestResults()
```

Internally it executes commands with `--json` wherever supported.

Do not parse terminal-formatted tables.

The CLI already provides JSON-oriented operations for retrieval, deployment, validation, reporting and testing. ([Developer][3])

---

# 5. Org Manager

## UI

```text
Source
┌───────────────────────────────┐
│ DEV Sandbox                   │
│ rahadul@example.dev           │
└───────────────────────────────┘

Target
┌───────────────────────────────┐
│ Production                    │
│ rahadul@example.com           │
└───────────────────────────────┘
```

## Functions

Use locally authenticated Salesforce orgs.

Primary CLI:

```bash
sf org list --json
```

Org details:

```bash
sf org display --target-org <alias> --json
```

Display:

* alias
* username
* org ID
* instance URL
* connected status
* sandbox/production where determinable
* default org
* authentication status

Never persist authentication credentials.

---

# 6. Metadata Explorer

This should become one of the major application modules.

UI:

```text
Metadata

Search components...

☐ Apex Classes
    ☐ AccountService
    ☐ OpportunityService
    ☐ QuoteService

☐ Apex Triggers
    ☐ AccountTrigger

☐ Custom Objects
    ▼ Account
       ☐ Fields
       ☐ Validation Rules
       ☐ Record Types
       ☐ List Views

☐ Flows
☐ Lightning Web Components
☐ Permission Sets
☐ Profiles
☐ Layouts
☐ Custom Metadata
...
```

Use CLI metadata discovery.

Salesforce CLI currently exposes commands for both enabled metadata types and components of a specified metadata type. ([Developer][2])

The engine needs a normalized component identity:

```text
MetadataComponent

type
fullName
parent
children
filePaths
sourceOrg
targetOrg
```

For example:

```text
CustomObject : Account
CustomField  : Account.Customer_Type__c
Layout       : Account-Account Layout
ApexClass    : AccountService
Flow         : Create_Opportunity
```

---

# 7. Metadata Filtering

Replicate the useful Gearset concept of comparison filters. Gearset itself allows users to select metadata types before comparison. ([Gearset Help Center][1])

Support:

```text
Common Metadata
Apex Only
Automation
Objects & Fields
Security
UI
Everything
Custom Selection
```

Example:

```text
Custom Filter

[x] ApexClass
[x] ApexTrigger
[x] CustomObject
[x] CustomField
[x] Flow
[x] LightningComponentBundle
[x] PermissionSet
[ ] Profile
[ ] Reports
```

No database required.

The filter lives in memory or a local JSON file.

---

# 8. Comparison Workspace

When a comparison starts:

```text
.workspace/
   comparison-20260820-001/
      source/
      target/
      normalized/
      manifests/
      deployment/
      validation/
      reports/
      workspace.json
```

This is not a database.

It is disposable filesystem state.

The workflow:

```text
Source Org
    │
    └── Retrieve
         │
         ▼
      source/

Target Org
    │
    └── Retrieve
         │
         ▼
      target/

source/ + target/
         │
         ▼
 Metadata Normalizer
         │
         ▼
     Diff Engine
```

Salesforce CLI supports retrieving selected metadata or manifest-based metadata into local files. ([Developer][3])

---

# 9. Metadata Normalization Engine

A raw text diff is insufficient.

Salesforce XML often contains ordering differences that don't represent meaningful metadata changes.

Create:

```text
MetadataNormalizer
```

Pipeline:

```text
Raw XML
   ↓
Parse XML
   ↓
Canonical structure
   ↓
Normalize ordering
   ↓
Normalize whitespace
   ↓
Remove irrelevant formatting
   ↓
Stable serialized representation
   ↓
Hash
```

Then compare hashes.

Example:

Source:

```xml
<required>true</required>
<label>Customer Type</label>
```

Target:

```xml
<label>Customer Type</label>
<required>true</required>
```

A naive textual diff may flag this.

A semantic comparison should determine whether the metadata is effectively equivalent where ordering isn't semantically meaningful.

---

# 10. Comparison Status Model

Every component receives one status:

```text
NEW
CHANGED
DELETED
IDENTICAL
SOURCE_ONLY
TARGET_ONLY
CONFLICT
ERROR
```

UI:

| Status  | Component          | Type         |
| ------- | ------------------ | ------------ |
| New     | Customer_Type__c   | Custom Field |
| Changed | AccountService     | Apex Class   |
| Deleted | OldFlow            | Flow         |
| Same    | OpportunityTrigger | Apex Trigger |

Add filtering:

```text
All
New
Changed
Deleted
Identical
Selected
Errors
```

---

# 11. Side-by-Side Diff Viewer

For code:

```text
SOURCE                         TARGET

public class Service {         public class Service {
                               + private Integer count;
}
```

For XML:

provide two modes:

```text
Raw XML
Structured
```

Structured mode is more useful.

Example:

```text
Account.Customer_Type__c

Property          Source            Target

Label             Customer Type     Customer Category
Required          false             true
Type              Picklist          Picklist
```

This is where the application can become significantly easier to use than raw Salesforce CLI.

---

# 12. Subcomponent Engine

Gearset exposes constituent components such as fields underneath parent objects. ([Gearset Help Center][4])

Your internal graph should support:

```text
Account
├── Fields
│   ├── Customer_Type__c
│   └── Region__c
├── Record Types
│   └── Business
├── Validation Rules
├── List Views
└── Field Sets
```

This allows users to deploy:

```text
Account.Customer_Type__c
```

without necessarily deploying every change belonging to `Account`.

---

# 13. Dependency Engine

This is one of the hardest parts of the project.

Create:

```text
DependencyGraphEngine
```

Graph structure:

```text
Node = Salesforce metadata component

Edge =
    DEPENDS_ON
    REFERENCED_BY
    CONTAINS
    PERMISSION_REFERENCE
```

Example:

```text
Opportunity.New_Field__c
       ▲
       │
       ├── OpportunityTrigger
       │
       ├── OpportunityFlow
       │
       ├── Opportunity Layout
       │
       └── Sales Permission Set
```

Dependency sources should come from locally retrieved metadata.

### Apex

Parse:

```text
Schema.Account
Account.Field__c
Object__c
CustomSetting__c
CustomMetadata__mdt
```

### Flow

Parse XML references to:

```text
objects
fields
Apex actions
subflows
record types
email alerts
custom metadata
```

### Permission Sets / Profiles

Parse:

```text
objectPermissions
fieldPermissions
classAccesses
pageAccesses
customPermissions
tabSettings
```

### Layouts

Parse:

```text
fields
buttons
actions
relatedLists
```

### Lightning Pages

Parse:

```text
components
fields
actions
```

### Objects

Parse relationships:

```text
MasterDetail
Lookup
RecordType
GlobalValueSet
```

This produces:

```text
Selected component

Account.Customer_Status__c

Dependencies
├─ Account
├─ Customer_Statuses global value set
└─ Sales_User permission set

Referenced by
├─ AccountValidation
├─ CustomerFlow
└─ AccountTrigger
```

Gearset has a similar distinction between components, dependencies, and related permissions. ([Gearset Help Center][4])

---

# 14. Dependency Auto-Selection

When the user selects:

```text
OpportunityService
```

show:

```text
3 dependencies detected

[x] Opportunity.Customer_Type__c
[x] Customer_Config__mdt
[x] OpportunitySelector
```

Actions:

```text
Add All
Review
Ignore
```

Never silently add metadata.

---

# 15. Problem Analyzer

Build a local rules engine:

```text
DeploymentProblemAnalyzer
```

Each rule:

```text
id
name
severity
appliesTo
detect()
suggest()
autoFixAvailable
```

Severity:

```text
INFO
WARNING
ERROR
BLOCKER
```

Example rules:

### Missing dependency

```text
Apex class references field
but field isn't target-existing or selected.
```

### Missing parent

```text
Custom Field selected
but parent Custom Object missing.
```

### Permission dependency

```text
Permission Set references Apex class
that isn't present in target.
```

### Missing Record Type

```text
Layout references Record Type
not present in target.
```

### Flow dependency

```text
Flow references Apex Action
not present in target.
```

### Destructive dependency

```text
Field being deleted
but existing Flow references it.
```

### Sharing Model conflict

This could catch issues similar to:

```text
Cannot set sharingModel to ReadWrite
on a CustomObject with a MasterDetail relationship
```

before trying the deployment where enough local metadata exists to prove the conflict.

Do not promise Gearset-level dependency intelligence immediately. Their analyzer is a mature proprietary system. Your first version should be deterministic and rule-driven.

---

# 16. Deployment Builder

Selected differences go into:

```text
DeploymentPlan
```

Conceptually:

```text
Deploy

12 components selected

Apex Class             3
Custom Field           4
Flow                   2
Permission Set         2
Layout                 1

Dependencies            5
Warnings                2
Errors                  0
```

Generate:

```text
package.xml
```

and where required:

```text
destructiveChangesPre.xml
destructiveChangesPost.xml
```

Salesforce CLI can generate regular and destructive manifests. ([Developer][5])

---

# 17. Destructive Changes

This needs first-class UI support.

If:

```text
Source: missing
Target: Old_Field__c
```

do not automatically treat it as a deletion.

Instead:

```text
Old_Field__c

Exists only in target.

[ ] Ignore
[ ] Delete from target
```

Then generate destructive changes only when the user explicitly chooses deletion.

This is important for production safety.

---

# 18. Deployment Order Planner

Automatically organize metadata approximately as:

```text
1. Global Value Sets
2. Objects
3. Fields
4. Record Types
5. Apex
6. Flows
7. Lightning
8. Layouts
9. Permission Sets
10. Profiles
11. Remaining metadata
```

Gearset itself recommends thinking about complex deployments in dependency-oriented tiers such as data structure, programmability, presentation, security, and remaining components. ([Gearset Help Center][6])

Your engine can detect whether one deployment is safe or should be split.

Example:

```text
Recommended Deployment

Stage 1
17 metadata components

Stage 2
23 metadata components

Reason:
Stage 2 depends on components introduced by Stage 1.
```

---

# 19. Deployment Preview

Before validation, execute:

```bash
sf project deploy preview ...
```

The CLI can report what would be deployed/deleted and, where source tracking applies, potential conflicts. ([Developer][7])

UI:

```text
Deployment Preview

Will Deploy      38
Will Delete       2
Ignored           5
Conflicts         1
```

This provides an additional safety layer independent of your own analyzer.

---

# 20. Validation Engine

UI:

```text
Validate Deployment

Target:
Production

Test Level:

○ NoTestRun
○ RunSpecifiedTests
● RunLocalTests
○ RunAllTestsInOrg

[ Validate ]
```

For Production:

```bash
sf project deploy validate ...
```

Salesforce states that this performs validation without executing the deployment and returns a validation job ID. ([Developer][8])

For appropriate sandbox dry runs:

```bash
sf project deploy start --dry-run ...
```

Salesforce specifically distinguishes Production validation from sandbox dry-run validation. ([Developer][8])

---

# 21. Validation Result Dashboard

Display:

```text
VALIDATION FAILED

Components
Passed                     72
Failed                      3

Tests
Passed                    214
Failed                      4

Coverage
Overall                    81%

Errors
──────────────────────────────

TaskService
Coverage: 43%

TaskServiceTest
System.NullPointerException
Line 132

ProjectServiceTest
Assertion Failed
Expected: true
Actual: false
```

Allow:

```text
Copy Error
Open Component
Open Test
Filter Failed
Export Result
```

---

# 22. Apex Test Manager

This can be a standalone feature outside deployment.

Salesforce CLI supports selecting Apex test classes/methods and retrieving coverage. ([Developer][9])

UI:

```text
Apex Tests

Search...

[x] AccountServiceTest
[x] OpportunityServiceTest
[ ] QuoteServiceTest

Test Level
Specified Tests

[x] Include Code Coverage

[ Run Tests ]
```

Result:

```text
Tests:     92 / 94 passed
Coverage:  86%

Failed Tests

OpportunityServiceTest.testClone
Assertion Failed
```

---

# 23. Coverage Explorer

Create:

```text
ApexClass                      Coverage

AccountService                   91%
OpportunityService               82%
TaskService                      43%
ProjectService                   27%
```

Click class:

```text
TaskService

43% Coverage

Covered lines       218
Uncovered lines      291
```

If the coverage output provides detailed line information, render uncovered lines directly in the code viewer.

---

# 24. Quick Deploy

If Production validation succeeds:

```text
Validation Successful

Deployment ID
0Af...

Valid Until
...

[ Quick Deploy ]
```

Run:

```bash
sf project deploy quick --job-id <id>
```

Salesforce allows successful validated deployments to be quick deployed without rerunning the validation tests; validation IDs are valid for a limited window. ([Developer][10])

---

# 25. Deployment Monitor

Use async deployment.

```text
Deployment
────────────

Status       In Progress
Components   51 / 87
Tests        144 / 210

[ Cancel Deployment ]
```

Commands:

```bash
sf project deploy report
sf project deploy resume
sf project deploy cancel
```

All are already provided by Salesforce CLI. ([Developer][11])

---

# 26. Deployment Error Interpreter

Raw Salesforce errors are often poor UX.

Create:

```text
SalesforceErrorInterpreter
```

Example:

```text
Raw

In field: apexClass - no ApexClass
named CommentService found
```

Display:

```text
Missing Apex Dependency

Permission Set references:
CommentService

But CommentService doesn't exist in the target
and isn't included in this deployment.

Suggested action:

Add CommentService to deployment.
```

Rules can be created for common errors:

```text
Missing metadata
Missing ApexClass
Missing CustomField
Missing RecordType
Invalid picklist
Duplicate metadata
Permission errors
Code coverage
Test failures
Master-detail conflicts
Sharing model conflicts
Flow dependencies
Profile dependencies
Invalid references
API version conflicts
```

This will provide substantial value.

---

# 27. Profile and Permission Visualizer

This should be its own subsystem.

For example:

```text
Sales_User Permission Set

                         SOURCE     TARGET

Account Read               ✓          ✓
Account Edit               ✓          ✗
Customer_Type__c Read      ✓          ✗
Customer_Type__c Edit      ✓          ✗
AccountService Apex        ✓          ✓
```

Allow selection at the permission level.

The difficult part is merging only selected permission entries instead of blindly deploying an entire Profile XML file.

Create:

```text
PermissionMetadataMergeEngine
```

It parses source and target metadata and generates a merged deployment artifact.

---

# 28. Local Rollback

A database is not required for basic rollback.

Before deployment:

```text
Retrieve affected target metadata
```

Store:

```text
workspace/
    backup-before-deploy/
```

After deployment:

```text
Rollback
```

would redeploy that snapshot.

Important limitation:

This isn't a universal transaction rollback. If metadata was newly created, rollback may also require destructive metadata to remove it.

Therefore generate:

```text
rollback-package.xml
rollback-destructiveChanges.xml
```

before deploying.

---

# 29. No-Database Persistence

Use the filesystem only.

For example:

```text
~/.sf-deployer/
│
├── settings.json
│
├── filters/
│   └── default.json
│
├── comparisons/
│   └── cmp-20260820-001/
│
├── deployments/
│   └── dep-20260820-001/
│
└── cache/
```

This can support:

* saved filters
* local comparison results
* local deployment packages
* validation result files
* rollback snapshots
* local logs

without SQLite, PostgreSQL, MongoDB, Firebase, Supabase, etc.

If you want the application completely stateless, make these directories temporary instead.

---

# 30. Recommended Internal Modules

I would structure the backend roughly as:

```text
src/
├── cli/
│   ├── SalesforceCliService
│   ├── CliProcessManager
│   └── CliJsonParser
│
├── orgs/
│   ├── OrgService
│   └── OrgValidator
│
├── metadata/
│   ├── MetadataDiscoveryService
│   ├── MetadataRetrieveService
│   ├── MetadataParser
│   ├── MetadataNormalizer
│   └── MetadataIndex
│
├── comparison/
│   ├── ComparisonEngine
│   ├── DiffEngine
│   ├── XmlDiffEngine
│   └── CodeDiffEngine
│
├── dependencies/
│   ├── DependencyGraph
│   ├── ApexDependencyParser
│   ├── FlowDependencyParser
│   ├── ObjectDependencyParser
│   ├── LayoutDependencyParser
│   └── PermissionDependencyParser
│
├── analyzer/
│   ├── ProblemAnalyzer
│   ├── RuleRegistry
│   └── rules/
│
├── deployment/
│   ├── DeploymentPlanService
│   ├── ManifestBuilder
│   ├── DestructiveChangeBuilder
│   ├── DeploymentOrderPlanner
│   ├── ValidationService
│   ├── DeploymentService
│   └── RollbackService
│
├── testing/
│   ├── ApexTestService
│   └── CoverageService
│
├── workspace/
│   ├── WorkspaceManager
│   └── CacheManager
│
└── errors/
    ├── ErrorParser
    └── ErrorSuggestionEngine
```

This separation matters. Otherwise your CLI execution, XML parsing, comparison logic and UI logic will become tightly coupled very quickly.

---

# 31. Frontend Architecture

Recommended primary screens:

```text
Dashboard
    │
    ├── Compare & Deploy
    ├── Metadata Browser
    ├── Apex Tests
    ├── Deployment Monitor
    └── Local Packages
```

The main Gearset-style workflow should use a wizard:

```text
STEP 1
Choose Source & Target

          ↓

STEP 2
Choose Metadata

          ↓

STEP 3
Compare

          ↓

STEP 4
Select Changes

          ↓

STEP 5
Dependencies

          ↓

STEP 6
Problem Analysis

          ↓

STEP 7
Deployment Summary

          ↓

STEP 8
Validate

          ↓

STEP 9
Deploy

          ↓

STEP 10
Results
```

---

# 32. Additional CLI-Only Features Worth Adding

Once Compare & Deploy works, the same architecture can expose other valuable Salesforce CLI capabilities without needing a database.

### Org utilities

```text
List authenticated orgs
Authenticate new org
Logout org
Open org
View org information
View org limits
```

### Metadata utilities

```text
Browse metadata
Retrieve metadata
Retrieve preview
Generate package.xml
Deploy metadata
Deploy preview
Delete metadata
```

### Testing

```text
Run Apex tests
Run selected tests
View coverage
Retrieve previous async test results
```

### Source tracking

For supported scratch orgs/sandboxes:

```text
View source changes
Retrieve changes
Deploy changes
Preview conflicts
Reset tracking
Clear tracking
```

Salesforce CLI itself notes that source tracking differs by org type and that Production doesn't provide source tracking. ([Developer][7])

### Logs

```text
List Apex logs
View Apex log
Tail logs
```

Salesforce CLI provides commands for these operations as well. ([Developer][12])

---

# 33. Features I Would Explicitly Exclude

Under your **Salesforce CLI + no database** requirement, do not initially attempt to reproduce these Gearset capabilities:

| Gearset-like capability        | Decision                         |
| ------------------------------ | -------------------------------- |
| Org-to-org metadata comparison | Build                            |
| Metadata filtering             | Build                            |
| XML/code diff                  | Build                            |
| Dependency analysis            | Build locally                    |
| Problem analysis               | Build locally                    |
| Permission comparison          | Build                            |
| Selective deployment           | Build                            |
| Validation                     | Build                            |
| Quick deploy                   | Build                            |
| Destructive changes            | Build                            |
| Apex tests                     | Build                            |
| Code coverage                  | Build                            |
| Rollback                       | Build using filesystem snapshots |
| Saved deployment packages      | Local filesystem only            |
| Data migration                 | Exclude                          |
| Salesforce record deployment   | Exclude                          |
| CPQ data migration             | Exclude                          |
| Vlocity data packs             | Exclude                          |
| Cloud deployment history       | Exclude                          |
| Team accounts                  | Exclude                          |
| Team RBAC                      | Exclude                          |
| Approval workflows             | Exclude                          |
| Jira integration               | Exclude                          |
| Shared deployment history      | Exclude                          |
| Hosted CI/CD                   | Exclude                          |
| Pull request automation        | Exclude                          |
| Cloud backup                   | Exclude                          |
| Continuous org monitoring      | Exclude                          |
| Salesforce data backup         | Exclude                          |

Those exclusions keep the architecture aligned with your requirement instead of turning this into an unnecessary Gearset clone.

---

# 34. Implementation Roadmap

I would build it in this order.

### Phase 1 — CLI Foundation

Build:

```text
CLI detection
CLI version check
Org listing
Org validation
Process execution
JSON parsing
Error handling
Async command handling
```

### Phase 2 — Metadata Explorer

Build:

```text
metadata type discovery
metadata component discovery
search
filtering
component tree
manifest generation
```

### Phase 3 — Retrieval Workspace

Build:

```text
source retrieval
target retrieval
temporary project creation
workspace lifecycle
cache
cleanup
```

### Phase 4 — Comparison Engine

Build:

```text
XML parser
normalizer
hashing
component indexing
source/target matching
new/changed/deleted detection
code diff
XML diff
```

At this point you already have a useful tool.

### Phase 5 — Deployment Builder

Build:

```text
selection
package.xml
destructive changes
deployment preview
deploy
deploy monitor
cancel
results
```

### Phase 6 — Validation

Build:

```text
dry run
Production validation
test-level selection
specified tests
validation results
quick deploy
```

### Phase 7 — Dependency Engine

Build parsers in this order:

```text
Objects/Fields
Apex
Flows
Permission Sets
Profiles
Layouts
Lightning Pages
Remaining metadata
```

This is one of the largest phases.

### Phase 8 — Problem Analyzer

Start with perhaps 20–30 deterministic rules.

Then continuously expand it based on real deployment failures.

### Phase 9 — Permission Visualizer

Build:

```text
Profiles
Permission Sets
Object permissions
Field permissions
Apex access
Visualforce access
Custom Permissions
Record type visibility
```

### Phase 10 — Rollback

Build:

```text
pre-deployment target snapshot
rollback package
rollback destructive package
rollback preview
rollback deployment
```

### Phase 11 — Developer Utilities

Add:

```text
Apex test runner
coverage browser
Apex logs
source tracking
org limits
metadata download
package generator
```

---

# 35. Final Architecture

The resulting system would effectively be:

```text
┌──────────────── SALESFORCE DEVOPS GUI ────────────────┐
│                                                       │
│  ORGS       METADATA       COMPARE       TESTS        │
│                                                       │
│  Source     Browser        Diff          Apex          │
│  Target     Retrieve       Dependency    Coverage      │
│                         │                             │
│                         ▼                             │
│                 Deployment Builder                   │
│                         │                             │
│                Problem Analyzer                      │
│                         │                             │
│                 Deployment Preview                   │
│                         │                             │
│                      Validate                        │
│                         │                             │
│              ┌──────────┴──────────┐                 │
│              ▼                     ▼                 │
│            Deploy              Quick Deploy          │
│              │                     │                 │
│              └──────────┬──────────┘                 │
│                         ▼                             │
│                 Results / Rollback                   │
│                                                       │
└─────────────────────────┬─────────────────────────────┘
                          │
                    CLI Adapter
                          │
                          ▼
                   Salesforce CLI
                          │
             ┌────────────┴────────────┐
             ▼                         ▼
          Source Org                Target Org
```

The major architectural principle, Sir, should be:

> **Do not build another Salesforce API client. Build an intelligent orchestration, comparison, analysis and visualization layer on top of Salesforce CLI.**

That gives you the valuable part of Gearset—**understanding exactly what is different, what must accompany a change, whether the deployment is safe, and what failed**—while Salesforce CLI remains responsible for authentication, retrieval, validation and deployment.

The difficult engineering work will be approximately **20% CLI integration and 80% metadata normalization, comparison, dependency resolution, permissions merging, problem analysis and UX**. Treating this as merely a graphical wrapper around `sf project deploy start` would severely underestimate the project.

