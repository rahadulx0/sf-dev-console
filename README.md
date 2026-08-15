# SF Dev Console

A local, professional web interface for Salesforce CLI workflows. The Salesforce CLI remains the authentication and execution engine; the browser never receives access tokens and the application requires no database.

## Included workflows

- Environment validation and locally authorized org selection
- Browser-based authorization for new Production, Developer, Sandbox, and Dev Hub orgs
- Safe org information and **Open Salesforce** action
- Lazy-loaded metadata type and component explorer
- Apex, frontend, object, automation, and security presets
- Persistent metadata basket and reusable saved selections
- `package.xml` generation and preview
- Asynchronous Metadata API ZIP retrieval and local retrieval history
- SOQL console with tabular results and CSV export
- Schema-aware fuzzy SOQL completion for objects and fields
- `SELECT` + Tab expansion to all fields for the query object
- Paginated query results, row selection, Excel copy, and guarded record deletion
- Anonymous Apex execution
- Apex tests with configurable test level and coverage
- Debug-log inventory and log inspection
- Pagination for debug logs and installed packages
- API limits and installed-package inventory
- Record inspector for Salesforce and Tooling API records
- Schema-aware record editing with field-level updateability checks and validation feedback
- Validation-first deployment preview and check-only validation
- Responsive desktop/mobile interface
- Full-width workspace with a persistent collapsible desktop navigation rail
- Thin bottom status bar for page, org, connection, and refresh context

## Interface

- Dark and light themes; the operating system preference is used on first run and the choice is remembered
- `⌘K` / `Ctrl+K` command palette for pages, org switching, and common actions
- Hash routing, so back, forward, refresh, and per-object links (`#/objects/Account`) all work
- Cached org reads with visible data age and a per-view refresh, instead of re-running the CLI on every page change
- A job strip that shows running retrievals and deployments with elapsed time
- Non-blocking toasts in place of modal browser alerts

The in-app **Capabilities** screen shows the complete requested MVP checklist. Detailed implementation and verification evidence is recorded in [FEATURE_MATRIX.md](./FEATURE_MATRIX.md).

## Requirements

- Node.js 20 or newer
- [Salesforce CLI (`sf`)](https://developer.salesforce.com/tools/salesforcecli)
- At least one locally authorized org (`sf org list`)

## Run in development

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. Vite proxies API calls to the local backend at `127.0.0.1:4173`.

## Run the production build

```bash
npm run build
npm start
```

Open `http://127.0.0.1:4173`. The Fastify server serves the built React application and API together.

## macOS desktop application

An Apple Silicon DMG can be built with:

```bash
npm run dist:mac
```

The installer is written to `release/SF-Dev-Console-<version>-arm64.dmg`. Drag **SF Dev Console** into Applications, then open it like a normal Mac application. The desktop app bundles the client, backend, and Node/Electron runtime; users don't install npm dependencies or start a server.

Salesforce CLI must still be installed separately because the app uses the user's official CLI authorization store. The desktop launcher detects common Finder PATH locations including `~/.local/bin`, `/opt/homebrew/bin`, and `/usr/local/bin`.

Desktop data is stored in:

```text
~/Library/Application Support/SF Dev Console/data
```

The current DMG is Apple Silicon and unsigned. On first launch, right-click the app and choose **Open** if Gatekeeper blocks it. Public distribution without that warning requires an Apple Developer ID Application certificate and Apple notarization.

## Device-local storage

By default, runtime files are stored under:

```text
~/.sf-dev-console/
├── state.json
└── workspace/
    ├── sfdx-project.json
    ├── manifest/
    └── retrieve/
```

`state.json` contains only the selected org identifier, retrieval metadata, and saved component sets. Retrieved files and generated manifests remain on the device. To change the location, set `SF_CONSOLE_HOME` before starting the server.

## Security model

- The API listens only on `127.0.0.1`.
- All CLI processes use `spawn('sf', args, { shell: false })`.
- There is no arbitrary command/terminal endpoint.
- Org identifiers and metadata types are allow-list validated.
- Each UI operation maps to a fixed Salesforce CLI command family.
- The backend never requests `sf org display --verbose`, so refresh tokens and SFDX auth URLs are not exposed.
- Salesforce authentication is owned entirely by the installed CLI.

Anonymous Apex, deployments, and other developer operations can change org data. The UI labels these workflows clearly, but the connected Salesforce user's permissions remain the ultimate access control.

## Project layout

```text
client/src/
  app/        shell, hash router, theme, command palette, job strip
  features/   one directory per page (metadata, query, deploy, …)
  ui/         shared primitives (panel, table, modal, toast, virtual list)
  lib/        api client, resource cache, fuzzy search, formatting
  styles/     tokens.css, base.css, components.css, shell.css, features.css
server/src/
  routes/     orgs, metadata, data, apex, deploy, retrievals
  state/      in-memory state with debounced atomic writes
  cli/        CliRunner with a concurrency pool and read cache
```

Each page is a lazily loaded chunk, so the initial download is the shell plus the current page.

## Performance notes

Every `sf` invocation starts a new Node runtime and costs roughly one to three seconds, so
repeated reads are the dominant cost in the interface.

- Read-only CLI results are cached on both sides. Concurrent requests for the same command
  share one child process, and a view shows how old its data is with a refresh control.
- Concurrent `sf` processes are capped (default 4, override with `SF_CONSOLE_MAX_CLI`).
  Record counting across 25 objects no longer starts 25 runtimes at once.
- Read requests are cancelled when the client navigates away, which terminates the child
  process rather than letting it run unwatched. Mutating operations always run to completion.
- Application state is held in memory and flushed atomically after a short debounce, instead
  of a full read-modify-write of `state.json` on every API response.

Useful checks:

```bash
npm run typecheck
npm run build
```

The original specification is in [plan.md](./plan.md). The implemented expansion and future phased roadmap are in [EXPANSION_PLAN.md](./EXPANSION_PLAN.md). Actual deployment, bulk data tooling, structured log analysis, and org-to-org comparison are planned behind additional safety controls.
