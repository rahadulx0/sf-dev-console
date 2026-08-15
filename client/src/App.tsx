import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Box,
  Braces,
  Check,
  ChevronDown,
  Cloud,
  Code2,
  Copy,
  Database,
  Download,
  ExternalLink,
  FileArchive,
  FlaskConical,
  Gauge,
  History,
  LayoutDashboard,
  LoaderCircle,
  Menu,
  Package,
  PackageCheck,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Rocket,
  Save,
  Search,
  SearchCode,
  ScrollText,
  ShieldCheck,
  Terminal,
  TestTube2,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { api } from "./api";
import type { Org, Page, Selection } from "./types";
import { fuzzyScore, fuzzySearch } from "./fuzzy";

const nav = [
  ["Overview", "overview", LayoutDashboard],
  ["Metadata explorer", "metadata", Box],
  ["Saved selections", "saved", PackageCheck],
  ["Retrieval history", "history", History],
  ["Object explorer", "objects", Database],
  ["SOQL query", "query", Terminal],
  ["Record inspector", "inspector", SearchCode],
  ["Anonymous Apex", "apex", Code2],
  ["Apex tests", "tests", TestTube2],
  ["Debug logs", "logs", ScrollText],
  ["Org information", "org", Cloud],
  ["Org limits", "limits", Gauge],
  ["Installed packages", "packages", Package],
  ["Deploy & validate", "deploy", Rocket],
  ["Operation history", "activities", Activity],
  ["Capabilities", "capabilities", ShieldCheck],
] as const;
const presets: { label: string; types: string[]; icon: any }[] = [
  {
    label: "Apex",
    types: ["ApexClass", "ApexTrigger", "ApexTestSuite"],
    icon: Braces,
  },
  {
    label: "Frontend",
    types: [
      "LightningComponentBundle",
      "AuraDefinitionBundle",
      "FlexiPage",
      "StaticResource",
    ],
    icon: LayoutDashboard,
  },
  {
    label: "Objects",
    types: ["CustomObject", "Layout", "RecordType", "CustomTab"],
    icon: Database,
  },
  {
    label: "Automation",
    types: ["Flow", "Workflow", "ApprovalProcess"],
    icon: Zap,
  },
  {
    label: "Security",
    types: [
      "Profile",
      "PermissionSet",
      "PermissionSetGroup",
      "CustomPermission",
    ],
    icon: ShieldCheck,
  },
];
function Badge({
  children,
  tone = "neutral",
}: {
  children: any;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
function Empty({
  icon: Icon = Box,
  title,
  text,
}: {
  icon?: any;
  title: string;
  text: string;
}) {
  return (
    <div className="empty">
      <Icon />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
function App() {
  const [status, setStatus] = useState<any>();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [org, setOrg] = useState<Org>();
  const [page, setPage] = useState<Page>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mobile, setMobile] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("sf-sidebar-collapsed") === "true",
  );
  const [selections, setSelections] = useState<Selection[]>(() =>
    JSON.parse(localStorage.getItem("sf-selections") || "[]"),
  );
  useEffect(() => {
    Promise.all([
      api("/system/status"),
      api("/orgs").catch(() => ({ orgs: [] })),
    ])
      .then(([s, o]: any) => {
        setStatus(s);
        setOrgs(o.orgs);
        const remembered = o.selectedOrg || localStorage.getItem("sf-org");
        setOrg(
          o.orgs.find((x: Org) => (x.alias || x.username) === remembered) ||
            o.orgs[0],
        );
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(
    () => localStorage.setItem("sf-selections", JSON.stringify(selections)),
    [selections],
  );
  function toggleSidebar() {
    setCollapsed((value) => {
      localStorage.setItem("sf-sidebar-collapsed", String(!value));
      return !value;
    });
  }
  async function choose(o: Org) {
    setOrg(o);
    const id = o.alias || o.username;
    localStorage.setItem("sf-org", id);
    await api("/orgs/select", {
      method: "POST",
      body: JSON.stringify({ org: id }),
    });
    setPage("overview");
  }
  if (loading)
    return (
      <div className="splash">
        <div className="brandmark">
          <Cloud />
        </div>
        <h1>SF Dev Console</h1>
        <LoaderCircle className="spin" />
        <p>Connecting to your local Salesforce environment…</p>
      </div>
    );
  if (!status?.cli?.installed || !org)
    return (
      <Setup
        status={status}
        orgs={orgs}
        error={error}
        retry={() => location.reload()}
        choose={choose}
      />
    );
  const id = org.alias || org.username;
  const selectedCount = selections.reduce((n, s) => n + s.members.length, 0);
  return (
    <div className={`app ${collapsed ? "sidebar-collapsed" : ""}`}>
      <aside className={mobile ? "open" : ""}>
        <div className="logo">
          <div className="brandmark small">
            <Cloud />
          </div>
          <div className="logo-copy">
            <b>SF Dev Console</b>
            <span>Local developer tools</span>
          </div>
          <button
            className="sidebar-toggle desktop"
            onClick={toggleSidebar}
            title={collapsed ? "Expand navigation" : "Collapse navigation"}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </button>
          <button className="icon mobile" onClick={() => setMobile(false)}>
            <X />
          </button>
        </div>
        <div
          className="org-switch"
          title={`${org.alias || org.username} · ${org.username}`}
        >
          <span>ACTIVE ORG</span>
          <select
            value={id}
            onChange={(e) =>
              choose(
                orgs.find((x) => (x.alias || x.username) === e.target.value)!,
              )
            }
          >
            {orgs.map((o) => (
              <option key={o.username} value={o.alias || o.username}>
                {o.alias || o.username}
              </option>
            ))}
          </select>
          <small>
            <i /> Connected · {org.isSandbox ? "Sandbox" : "Production"}
          </small>
        </div>
        <nav>
          {nav.map(([label, key, Icon], i) => (
            <button
              key={key}
              title={collapsed ? label : undefined}
              className={page === key ? "active" : ""}
              onClick={() => {
                setPage(key);
                setMobile(false);
              }}
            >
              {i === 1 && <em>METADATA</em>}
              {i === 4 && <em>DEVELOPMENT</em>}
              {i === 10 && <em>ORG & RELEASE</em>}
              {i === 14 && <em>LOCAL</em>}
              <Icon />
              <span className="nav-label">{label}</span>
              {key === "metadata" && selectedCount > 0 ? (
                <Badge tone="blue">{selectedCount}</Badge>
              ) : null}
            </button>
          ))}
        </nav>
      </aside>
      <main>
        <div className="content">
          <div className={`page-surface page-${page}`}>
            {error && (
              <div className="alert">
                <X />
                {error}
                <button onClick={() => setError("")}>Dismiss</button>
              </div>
            )}
            {page === "overview" && (
              <Overview org={org} go={setPage} count={selectedCount} />
            )}{" "}
            {page === "metadata" && (
              <>
                <Metadata
                  orgId={id}
                  selections={selections}
                  setSelections={setSelections}
                  setError={setError}
                />
                <ManifestTools orgId={id} setError={setError} />
              </>
            )}{" "}
            {page === "objects" && (
              <ObjectExplorer orgId={id} setError={setError} />
            )}{" "}
            {page === "query" && <Query orgId={id} setError={setError} />}{" "}
            {page === "inspector" && (
              <RecordInspector orgId={id} setError={setError} />
            )}{" "}
            {page === "apex" && <Apex orgId={id} setError={setError} />}{" "}
            {page === "tests" && <Tests orgId={id} setError={setError} />}{" "}
            {page === "logs" && <DebugLogs orgId={id} setError={setError} />}{" "}
            {page === "org" && <OrgInfo orgId={id} setError={setError} />}{" "}
            {page === "limits" && <OrgLimits orgId={id} setError={setError} />}{" "}
            {page === "packages" && <Packages orgId={id} setError={setError} />}{" "}
            {page === "deploy" && <Deploy orgId={id} setError={setError} />}{" "}
            {page === "activities" && <Activities />}{" "}
            {page === "capabilities" && <Capabilities />}{" "}
            {page === "history" && <HistoryPage />}
            {page === "saved" && (
              <Saved selections={selections} setSelections={setSelections} />
            )}
          </div>
        </div>
        <footer className="status-bar">
          <button
            className="mobile status-menu"
            onClick={() => setMobile(true)}
          >
            <Menu />
          </button>
          <span className="status-page">
            {nav.find((n) => n[1] === page)?.[0]}
          </span>
          <span className="status-separator">·</span>
          <span>{org.alias || org.username}</span>
          <span className="status-separator">·</span>
          <span className="status-user">{org.username}</span>
          <span className="status-spacer" />
          <span className="status-connected">
            <i /> Connected
          </span>
          <button
            className="status-refresh"
            onClick={() => location.reload()}
            title="Reload Salesforce CLI status, authorized orgs, and current page data"
          >
            <RefreshCw /> Refresh
          </button>
        </footer>
      </main>
    </div>
  );
}

function Setup({ status, orgs, error, retry, choose }: any) {
  return (
    <div className="setup">
      <section>
        <div className="brandmark">
          <Cloud />
        </div>
        <Badge tone="blue">LOCAL-FIRST DEVELOPER TOOL</Badge>
        <h1>
          Your Salesforce workflow,
          <br />
          <span>without the command line.</span>
        </h1>
        <p>
          SF Dev Console securely uses the Salesforce CLI and orgs already
          authorized on this device. No cloud account. No database. No
          credentials exposed.
        </p>
        <div className="checks">
          <div>
            <Check />
            <span>
              <b>Node.js</b>
              <small>{status?.node || "Checking…"}</small>
            </span>
          </div>
          <div className={status?.cli?.installed ? "" : "bad"}>
            {status?.cli?.installed ? <Check /> : <X />}
            <span>
              <b>Salesforce CLI</b>
              <small>
                {status?.cli?.version || status?.cli?.error || "Not detected"}
              </small>
            </span>
          </div>
          <div className={orgs.length ? "" : "bad"}>
            {orgs.length ? <Check /> : <X />}
            <span>
              <b>Authorized orgs</b>
              <small>
                {orgs.length
                  ? `${orgs.length} org${orgs.length === 1 ? "" : "s"} available`
                  : "No local orgs found"}
              </small>
            </span>
          </div>
        </div>
        {orgs.length ? (
          <button className="primary large" onClick={() => choose(orgs[0])}>
            Continue to console <ExternalLink />
          </button>
        ) : (
          <button className="primary large" onClick={retry}>
            <RefreshCw /> Retry environment check
          </button>
        )}
        {error && <p className="error-text">{error}</p>}
      </section>
      <div className="setup-art">
        <div className="terminal-card">
          <span />
          <span />
          <span />
          <pre>
            <i>$</i> sf org list --json
            <br />
            <b>✓</b> Salesforce CLI detected
            <br />
            <b>✓</b> Authorized orgs loaded
            <br />
            <br />
            <em>Ready for development.</em>
          </pre>
        </div>
      </div>
    </div>
  );
}

function Overview({
  org,
  go,
  count,
}: {
  org: Org;
  go: (p: Page) => void;
  count: number;
}) {
  const [authorizing, setAuthorizing] = useState(false);
  const [activities, setActivities] = useState<any[]>([]);
  const [retrievals, setRetrievals] = useState<any[]>([]);
  useEffect(() => {
    Promise.all([api<any>("/activities"), api<any>("/retrievals")])
      .then(([a, r]) => {
        setActivities(a.activities.slice(0, 5));
        setRetrievals(r.retrievals.slice(0, 4));
      })
      .catch(() => {});
  }, []);
  const actions = [
    [Box, "Browse metadata", "Explore and retrieve org metadata", "metadata"],
    [
      Database,
      "Run a SOQL query",
      "Query records with structured results",
      "query",
    ],
    [
      SearchCode,
      "Inspect a record",
      "View and safely edit record fields",
      "inspector",
    ],
    [Code2, "Execute Apex", "Run anonymous Apex safely", "apex"],
    [TestTube2, "Run Apex tests", "Test classes and review coverage", "tests"],
    [ScrollText, "View debug logs", "Inspect recent execution logs", "logs"],
    [Gauge, "Check org limits", "Review API and platform capacity", "limits"],
    [Rocket, "Deploy metadata", "Preview, validate, and deploy", "deploy"],
  ] as const;
  return (
    <>
      <div className="hero">
        <div>
          <Badge tone="blue">DEVELOPER WORKSPACE</Badge>
          <h1>Good to see you.</h1>
          <p>
            Everything you need for <b>{org.alias || org.username}</b>, powered
            by your local Salesforce CLI.
          </p>
          <button
            className="secondary authorize-button"
            onClick={() => setAuthorizing(true)}
          >
            <Plus /> Authorize new org
          </button>
        </div>
        <div className="hero-stat">
          <Gauge />
          <span>
            <b>{org.connectedStatus || "Connected"}</b>
            <small>Org connection</small>
          </span>
        </div>
      </div>
      <UpdateCenter />
      <div className="section-head">
        <div>
          <h3>Developer shortcuts</h3>
          <p>Start a common Salesforce workflow.</p>
        </div>
      </div>
      <div className="action-grid home-actions">
        {actions.map(([Icon, title, text, page]) => (
          <button className="action-card" onClick={() => go(page)} key={page}>
            <span>
              <Icon />
            </span>
            <div>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
            <ExternalLink />
          </button>
        ))}
      </div>
      <div className="overview-grid">
        <section className="panel">
          <div className="section-head">
            <div>
              <h3>Workspace snapshot</h3>
              <p>Your local session at a glance.</p>
            </div>
          </div>
          <div className="stats">
            <div>
              <Box />
              <b>{count}</b>
              <span>Selected components</span>
            </div>
            <div>
              <Cloud />
              <b>{org.isSandbox ? "Sandbox" : "Production"}</b>
              <span>Environment</span>
            </div>
            <div>
              <Activity />
              <b>{activities.length}</b>
              <span>Recent operations</span>
            </div>
          </div>
        </section>
        <section className="panel privacy">
          <ShieldCheck />
          <div>
            <h3>Local by design</h3>
            <p>
              Authentication stays in Salesforce CLI. No access tokens are sent
              to the browser and no database is required.
            </p>
          </div>
        </section>
      </div>
      <div className="home-feed">
        <section className="panel">
          <div className="section-head">
            <div>
              <h3>Recent operations</h3>
              <p>Latest activity from this device.</p>
            </div>
            <button className="link" onClick={() => go("activities")}>
              View all
            </button>
          </div>
          {activities.length ? (
            activities.map((a) => (
              <div className="home-event" key={a.id}>
                <span className={a.statusCode < 400 ? "success" : "failed"}>
                  {a.statusCode < 400 ? <Check /> : <X />}
                </span>
                <div>
                  <b>{friendlyOperation(a.operation)}</b>
                  <small>
                    {a.method} · {new Date(a.createdAt).toLocaleString()}
                  </small>
                </div>
                <Badge tone={a.statusCode < 400 ? "green" : "red"}>
                  {a.statusCode}
                </Badge>
              </div>
            ))
          ) : (
            <Empty
              icon={Activity}
              title="No operations yet"
              text="Your recent local activity will appear here."
            />
          )}
        </section>
        <section className="panel">
          <div className="section-head">
            <div>
              <h3>Recent retrievals</h3>
              <p>Metadata jobs and downloadable results.</p>
            </div>
            <button className="link" onClick={() => go("history")}>
              View all
            </button>
          </div>
          {retrievals.length ? (
            retrievals.map((r) => (
              <div className="home-event" key={r.id}>
                <span className={r.status}>
                  {r.status === "running" ? (
                    <LoaderCircle className="spin" />
                  ) : r.status === "success" ? (
                    <Check />
                  ) : (
                    <X />
                  )}
                </span>
                <div>
                  <b>{r.orgLabel} metadata</b>
                  <small>
                    {r.componentCount} selections ·{" "}
                    {new Date(r.createdAt).toLocaleString()}
                  </small>
                </div>
                <Badge
                  tone={
                    r.status === "success"
                      ? "green"
                      : r.status === "failed"
                        ? "red"
                        : "blue"
                  }
                >
                  {r.status}
                </Badge>
              </div>
            ))
          ) : (
            <Empty
              icon={FileArchive}
              title="No retrievals yet"
              text="Retrieved metadata jobs will appear here."
            />
          )}
        </section>
      </div>
      {authorizing && <AuthorizeOrg onClose={() => setAuthorizing(false)} />}
    </>
  );
}

function UpdateCenter() {
  const updater = window.desktopUpdater;
  const [state, setState] = useState<DesktopUpdateState>();
  useEffect(() => {
    if (!updater) return;
    updater.getState().then(setState);
    return updater.onState(setState);
  }, []);
  if (!updater) return null;
  const working = ["checking", "downloading", "installing"].includes(
    state?.status || "",
  );
  async function update() {
    const bridge = window.desktopUpdater;
    if (!bridge) return;
    const checked = await bridge.check();
    if (checked.status !== "available") return;
    const downloaded = await bridge.download();
    if (downloaded.status === "ready") await bridge.install();
  }
  const label =
    state?.status === "checking"
      ? "Checking…"
      : state?.status === "downloading"
        ? `Downloading ${state.progress ?? 0}%`
        : state?.status === "installing"
          ? "Restarting…"
          : "Check for updates";
  return (
    <section className={`panel app-update ${state?.status || "idle"}`}>
      <span className="update-icon">
        {working ? (
          <LoaderCircle className="spin" />
        ) : state?.status === "current" ? (
          <Check />
        ) : (
          <Download />
        )}
      </span>
      <div>
        <div className="update-title">
          <h3>Application updates</h3>
          {state?.currentVersion && <Badge>v{state.currentVersion}</Badge>}
          {state?.latestVersion && state.status === "available" && (
            <Badge tone="blue">v{state.latestVersion} available</Badge>
          )}
        </div>
        <p>
          {state?.message ||
            "Download, install, and restart from the latest GitHub Release."}
        </p>
        {state?.status === "downloading" && (
          <progress max="100" value={state.progress || 0} />
        )}
      </div>
      <button className="secondary" disabled={working} onClick={update}>
        {working ? <LoaderCircle className="spin" /> : <RefreshCw />} {label}
      </button>
    </section>
  );
}
function friendlyOperation(value: string) {
  const labels: Record<string, string> = {
    "/api/query": "SOQL query executed",
    "/api/data/record": "Record inspected",
    "/api/data/record/update": "Record updated",
    "/api/tests": "Apex tests run",
    "/api/apex/execute": "Anonymous Apex executed",
    "/api/retrievals": "Metadata retrieval started",
    "/api/manifests/upload": "Manifest uploaded",
    "/api/orgs/select": "Active org changed",
  };
  return (
    labels[value] ||
    value
      .replace("/api/", "")
      .replaceAll("/", " · ")
      .replaceAll(":org", "org")
      .replaceAll(":type", "type")
  );
}
function AuthorizeOrg({ onClose }: { onClose: () => void }) {
  const [environment, setEnvironment] = useState<"production" | "sandbox">(
    "production",
  );
  const [alias, setAlias] = useState("");
  const [setDefault, setSetDefault] = useState(false);
  const [setDevHub, setSetDevHub] = useState(false);
  const [browser, setBrowser] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function authorize() {
    setBusy(true);
    setError("");
    try {
      await api("/orgs/authorize", {
        method: "POST",
        body: JSON.stringify({
          environment,
          alias: alias || undefined,
          setDefault,
          setDevHub,
          browser: browser || undefined,
        }),
      });
      location.reload();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal" onClick={() => !busy && onClose()}>
      <div className="auth-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>
            <Cloud />
            <b>Authorize a Salesforce org</b>
          </span>
          <button className="icon" disabled={busy} onClick={onClose}>
            <X />
          </button>
        </div>
        <div className="auth-body">
          <p>
            Salesforce CLI will open a secure browser window. Credentials and
            tokens remain managed by the CLI.
          </p>
          <div className="environment-options">
            <button
              className={environment === "production" ? "active" : ""}
              onClick={() => setEnvironment("production")}
            >
              <Cloud />
              <span>
                <b>Production / Developer</b>
                <small>login.salesforce.com</small>
              </span>
            </button>
            <button
              className={environment === "sandbox" ? "active" : ""}
              onClick={() => setEnvironment("sandbox")}
            >
              <FlaskConical />
              <span>
                <b>Sandbox</b>
                <small>test.salesforce.com</small>
              </span>
            </button>
          </div>
          <label>
            Org alias <span>Recommended</span>
            <input
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="for example, dev-sandbox"
            />
          </label>
          <label>
            Preferred browser
            <select
              value={browser}
              onChange={(e) => setBrowser(e.target.value)}
            >
              <option value="">System default</option>
              <option value="chrome">Google Chrome</option>
              <option value="firefox">Firefox</option>
              <option value="edge">Microsoft Edge</option>
            </select>
          </label>
          <div className="auth-checks">
            <label>
              <input
                type="checkbox"
                checked={setDefault}
                onChange={(e) => setSetDefault(e.target.checked)}
              />
              <span>
                <b>Set as default org</b>
                <small>Use this org when CLI commands omit a target.</small>
              </span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={setDevHub}
                onChange={(e) => setSetDevHub(e.target.checked)}
              />
              <span>
                <b>Set as default Dev Hub</b>
                <small>
                  Use this org for scratch-org and package operations.
                </small>
              </span>
            </label>
          </div>
          {error && <div className="inline-error">{error}</div>}
          {busy && (
            <div className="auth-wait">
              <LoaderCircle className="spin" />
              <span>
                <b>Complete login in your browser</b>
                <small>
                  This window will refresh after Salesforce CLI confirms
                  authorization.
                </small>
              </span>
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={busy} onClick={authorize}>
            {busy ? <LoaderCircle className="spin" /> : <ExternalLink />} Open
            Salesforce login
          </button>
        </div>
      </div>
    </div>
  );
}

function Metadata({
  orgId,
  selections,
  setSelections,
  setError,
}: {
  orgId: string;
  selections: Selection[];
  setSelections: (s: Selection[]) => void;
  setError: (s: string) => void;
}) {
  const [types, setTypes] = useState<string[]>([]);
  const [expanded, setExpanded] = useState("");
  const [components, setComponents] = useState<Record<string, string[]>>({});
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState("");
  const [retrieving, setRetrieving] = useState(false);
  useEffect(() => {
    setBusy(true);
    api<any>(`/orgs/${encodeURIComponent(orgId)}/metadata/types`)
      .then((r) => setTypes(r.types.map((x: any) => x.name).sort()))
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
  }, [orgId]);
  async function expand(type: string) {
    setExpanded(expanded === type ? "" : type);
    if (!components[type]) {
      setBusy(true);
      try {
        const r = await api<any>(
          `/orgs/${encodeURIComponent(orgId)}/metadata/${type}`,
        );
        setComponents((c) => ({
          ...c,
          [type]: r.components.map((x: any) => x.fullName),
        }));
      } catch (e: any) {
        setError(e.message);
      } finally {
        setBusy(false);
      }
    }
  }
  function toggle(type: string, member: string) {
    const current = selections.find((s) => s.type === type)?.members || [];
    const next = current.includes(member)
      ? current.filter((x) => x !== member)
      : [...current, member];
    setSelections([
      ...selections.filter((s) => s.type !== type),
      ...(next.length ? [{ type, members: next }] : []),
    ]);
  }
  function applyPreset(list: string[]) {
    const next = [...selections];
    for (const type of list) {
      if (!next.some((s) => s.type === type))
        next.push({ type, members: ["*"] });
    }
    setSelections(next);
  }
  async function showPreview() {
    const r = await api<any>("/manifests/preview", {
      method: "POST",
      body: JSON.stringify({ selections, apiVersion: "65.0" }),
    });
    setPreview(r.xml);
  }
  async function retrieve() {
    setRetrieving(true);
    try {
      await api("/retrievals", {
        method: "POST",
        body: JSON.stringify({
          org: orgId,
          orgLabel: orgId,
          selections,
          apiVersion: "65.0",
        }),
      });
      setPreview("");
      alert("Retrieval started. Track progress in Retrieval history.");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRetrieving(false);
    }
  }
  const displayed = fuzzySearch(types, search, (type) => type);
  // Keep an open type visible while its loaded components are being searched.
  if (expanded && !displayed.includes(expanded)) displayed.unshift(expanded);
  return (
    <>
      <div className="section-head">
        <div>
          <h3>Quick select</h3>
          <p>
            Start with a curated developer preset or browse individual types.
          </p>
        </div>
      </div>
      <div className="presets">
        {presets.map(({ label, types, icon: Icon }) => (
          <button onClick={() => applyPreset(types)} key={label}>
            <Icon />
            <span>
              <b>{label}</b>
              <small>{types.length} metadata types</small>
            </span>
            <Zap />
          </button>
        ))}
      </div>
      <div className="metadata-layout">
        <section className="panel metadata-list">
          <div className="section-head">
            <div>
              <h3>Metadata types</h3>
              <p>Components load only when you open a type.</p>
            </div>
            <Badge>{types.length} types</Badge>
          </div>
          <label className="search">
            <Search />
            <input
              placeholder="Fuzzy search types or loaded components…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          {busy && !types.length ? (
            <div className="loading">
              <LoaderCircle className="spin" />
              Reading metadata from your org…
            </div>
          ) : (
            displayed.map((type) => {
              const members = components[type] || [];
              const matchingMembers = fuzzySearch(
                members,
                search,
                (member) => member,
              );
              const selected =
                selections.find((s) => s.type === type)?.members || [];
              return (
                <div className="type" key={type}>
                  <button onClick={() => expand(type)}>
                    <ChevronDown
                      className={expanded === type ? "rotated" : ""}
                    />
                    <span>{type}</span>
                    {selected.length > 0 && (
                      <Badge tone="blue">
                        {selected.includes("*") ? "All" : selected.length}
                      </Badge>
                    )}
                  </button>
                  {expanded === type && (
                    <div className="members">
                      <div>
                        <button
                          className="link"
                          onClick={() => toggle(type, "*")}
                        >
                          {selected.includes("*")
                            ? "Clear type"
                            : "Select entire type"}
                        </button>
                        <small>
                          {members.length
                            ? `${matchingMembers.length}${search ? " matching" : ""} of ${members.length} components`
                            : "Loading…"}
                        </small>
                      </div>
                      {matchingMembers.map((member) => (
                        <label key={member}>
                          <input
                            type="checkbox"
                            checked={
                              selected.includes(member) ||
                              selected.includes("*")
                            }
                            disabled={selected.includes("*")}
                            onChange={() => toggle(type, member)}
                          />
                          <span>{member}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </section>
        <aside className="panel basket">
          <div className="section-head">
            <div>
              <h3>Selection</h3>
              <p>Ready for a manifest.</p>
            </div>
            <strong>
              {selections.reduce((n, s) => n + s.members.length, 0)}
            </strong>
          </div>
          {selections.length ? (
            selections.map((s) => (
              <div className="basket-row" key={s.type}>
                <span>
                  <b>{s.type}</b>
                  <small>
                    {s.members.includes("*")
                      ? "All components"
                      : `${s.members.length} selected`}
                  </small>
                </span>
                <button
                  className="icon"
                  onClick={() =>
                    setSelections(selections.filter((x) => x.type !== s.type))
                  }
                >
                  <X />
                </button>
              </div>
            ))
          ) : (
            <Empty
              icon={PackageCheck}
              title="Nothing selected"
              text="Choose metadata types or individual components."
            />
          )}
          <div className="basket-actions">
            <button
              className="secondary"
              disabled={!selections.length}
              onClick={showPreview}
            >
              Preview package.xml
            </button>
            <button
              className="primary"
              disabled={!selections.length || retrieving}
              onClick={retrieve}
            >
              {retrieving ? <LoaderCircle className="spin" /> : <FileArchive />}{" "}
              Retrieve metadata
            </button>
          </div>
        </aside>
      </div>
      {preview && (
        <div className="modal" onClick={() => setPreview("")}>
          <div onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <span>
                <FileArchive />
                <b>package.xml preview</b>
              </span>
              <button className="icon" onClick={() => setPreview("")}>
                <X />
              </button>
            </div>
            <pre>{preview}</pre>
            <div className="modal-foot">
              <button
                className="secondary"
                onClick={() => navigator.clipboard.writeText(preview)}
              >
                Copy XML
              </button>
              <button className="primary" onClick={retrieve}>
                Retrieve metadata
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Pagination({
  total,
  page,
  setPage,
  size,
  setSize,
}: {
  total: number;
  page: number;
  setPage: (n: number) => void;
  size: number;
  setSize: (n: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  useEffect(() => {
    if (page > pages) setPage(pages);
  }, [pages]);
  return (
    <div className="pagination">
      <span>
        {total
          ? `${(page - 1) * size + 1}–${Math.min(page * size, total)} of ${total}`
          : "0 items"}
      </span>
      <select
        value={size}
        onChange={(e) => {
          setSize(Number(e.target.value));
          setPage(1);
        }}
      >
        <option value="10">10 / page</option>
        <option value="25">25 / page</option>
        <option value="50">50 / page</option>
        <option value="100">100 / page</option>
      </select>
      <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
        Previous
      </button>
      <b>
        {page} / {pages}
      </b>
      <button disabled={page >= pages} onClick={() => setPage(page + 1)}>
        Next
      </button>
    </div>
  );
}
function Query({ orgId, setError }: any) {
  const [q, setQ] = useState(
    "SELECT Id, Name\nFROM Account\nORDER BY CreatedDate DESC\nLIMIT 100",
  );
  const [result, setResult] = useState<any>();
  const [busy, setBusy] = useState(false);
  const [objects, setObjects] = useState<string[]>([]);
  const [fields, setFields] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(50);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [tooling, setTooling] = useState(false);
  const editor = useRef<HTMLTextAreaElement>(null);
  const objectName = q.match(/\bFROM\s+([A-Za-z][A-Za-z0-9_]*)/i)?.[1] || "";
  useEffect(() => {
    api<any>(
      `/orgs/${encodeURIComponent(orgId)}/objects?category=all&tooling=${tooling}`,
    )
      .then((r) => setObjects(Array.isArray(r.objects) ? r.objects : []))
      .catch(() => {});
  }, [orgId, tooling]);
  useEffect(() => {
    if (!objectName) {
      setFields([]);
      return;
    }
    api<any>(
      `/orgs/${encodeURIComponent(orgId)}/objects/${objectName}?tooling=${tooling}`,
    )
      .then((r) => setFields(r.describe?.fields || []))
      .catch(() => setFields([]));
  }, [orgId, objectName, tooling]);
  function updateSuggestions(value: string, pos: number) {
    setCursor(pos);
    const before = value.slice(0, pos);
    const from = before.match(/\bFROM\s+([A-Za-z0-9_]*)$/i);
    const token = before.match(/[A-Za-z0-9_]*$/)?.[0] || "";
    const source = from ? objects : fields.map((f) => f.name);
    if (!from && !objectName) {
      setSuggestions([]);
      return;
    }
    setSuggestions(
      source
        .map((name) => ({
          name,
          score: fuzzyScore(name, from ? from[1] : token),
        }))
        .filter((x) => x.score >= 0)
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
        .slice(0, 10)
        .map((x) => x.name),
    );
    setActiveSuggestion(0);
  }
  function chooseSuggestion(name: string) {
    const before = q.slice(0, cursor),
      after = q.slice(cursor);
    const start = before.search(/[A-Za-z0-9_]*$/);
    const next = before.slice(0, start) + name + after;
    setQ(next);
    setSuggestions([]);
    requestAnimationFrame(() => {
      editor.current?.focus();
      editor.current?.setSelectionRange(
        start + name.length,
        start + name.length,
      );
    });
  }
  function keyDown(e: any) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      run();
      return;
    }
    if (
      e.key === "Tab" &&
      /^\s*SELECT\s*$/i.test(q.slice(0, e.currentTarget.selectionStart)) &&
      fields.length
    ) {
      e.preventDefault();
      const names = fields.map((f) => f.name).join(", ");
      const pos = e.currentTarget.selectionStart;
      setQ(q.slice(0, pos) + " " + names + q.slice(pos));
      setSuggestions([]);
      requestAnimationFrame(() =>
        editor.current?.setSelectionRange(
          pos + names.length + 1,
          pos + names.length + 1,
        ),
      );
      return;
    }
    if (
      suggestions.length &&
      ["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(e.key)
    ) {
      e.preventDefault();
      if (e.key === "ArrowDown")
        setActiveSuggestion((activeSuggestion + 1) % suggestions.length);
      if (e.key === "ArrowUp")
        setActiveSuggestion(
          (activeSuggestion - 1 + suggestions.length) % suggestions.length,
        );
      if (e.key === "Enter") chooseSuggestion(suggestions[activeSuggestion]);
      if (e.key === "Escape") setSuggestions([]);
    }
  }
  async function run() {
    setBusy(true);
    setSelected([]);
    setPage(1);
    try {
      setResult(
        await api("/query", {
          method: "POST",
          body: JSON.stringify({ org: orgId, query: q, tooling }),
        }),
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const records = result?.records || [];
  const columns = useMemo(
    () =>
      records[0]
        ? Object.keys(records[0]).filter((k) => k !== "attributes")
        : [],
    [records],
  );
  const visible = records.slice((page - 1) * size, page * size);
  const copyRows = async () => {
    const rows = selected.length
      ? records.filter((r: any) => selected.includes(r.Id))
      : records;
    await navigator.clipboard.writeText(toTsv(rows, columns));
  };
  async function deleteRecords() {
    const ids = [...selected];
    setBusy(true);
    try {
      const response = await api<any>("/data/records/delete", {
        method: "POST",
        body: JSON.stringify({
          org: orgId,
          sobject: objectName,
          recordIds: ids,
          confirmation,
          tooling,
        }),
      });
      const gone = new Set(response.deleted);
      setResult({
        ...result,
        records: records.filter((r: any) => !gone.has(r.Id)),
        totalSize: (result.totalSize || records.length) - gone.size,
      });
      setSelected([]);
      setConfirmDelete(false);
      setConfirmation("");
      if (response.failed.length)
        setError(`${response.failed.length} record(s) could not be deleted.`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <ConsoleLayout
      title="SOQL editor"
      text="Schema-aware field and object suggestions. Press Tab immediately after SELECT to expand all fields for the FROM object."
      action={
        <div className="query-run-actions">
          <label className="tooling-toggle" title="Run this query through Salesforce Tooling API">
            <input type="checkbox" checked={tooling} disabled={busy} onChange={(event) => { setTooling(event.target.checked); setResult(undefined); setSuggestions([]); setSelected([]); }} />
            <span><b>Tooling API</b><small>Off by default</small></span>
          </label>
          <button className="primary" onClick={run} disabled={busy}>
            {busy ? <LoaderCircle className="spin" /> : <Play />} Run query
          </button>
        </div>
      }
    >
      <div className="editor-wrap">
        <textarea
          ref={editor}
          className="editor"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            updateSuggestions(e.target.value, e.target.selectionStart);
          }}
          onClick={(e) => updateSuggestions(q, e.currentTarget.selectionStart)}
          onKeyDown={keyDown}
          spellCheck={false}
        />
        {suggestions.length > 0 && (
          <div className="suggestions">
            {suggestions.map((s, i) => (
              <button
                className={i === activeSuggestion ? "active" : ""}
                onMouseDown={(e) => {
                  e.preventDefault();
                  chooseSuggestion(s);
                }}
                key={s}
              >
                <span>{s}</span>
                <small>
                  {objectName && fields.some((f) => f.name === s)
                    ? fields.find((f) => f.name === s)?.type
                    : "SObject"}
                </small>
              </button>
            ))}
          </div>
        )}
        <div className="editor-status">
          <span>
            {objectName ? (
              <>
                <Check /> Schema loaded: {objectName} · {fields.length} fields
              </>
            ) : (
              "Type FROM to browse Salesforce objects"
            )}
          </span>
          <kbd>Ctrl/⌘ + Enter</kbd> Run
        </div>
      </div>
      {result && (
        <section className="results query-results">
          <div className="section-head">
            <div>
              <h3>Query results</h3>
              <p>
                {result.totalSize ?? records.length} records · {selected.length}{" "}
                selected · {tooling ? "Tooling API" : "Standard API"}
              </p>
            </div>
            <div className="result-actions">
              <button className="secondary" onClick={copyRows}>
                <Copy /> Copy {selected.length ? "selected" : "all"} for Excel
              </button>
              <button
                className="secondary destructive"
                disabled={!selected.length || !objectName}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 /> Delete selected
              </button>
            </div>
          </div>
          {records.length ? (
            <>
              <div className="table-wrap query-table">
                <table>
                  <thead>
                    <tr>
                      <th className="select-cell">
                        <input
                          type="checkbox"
                          checked={
                            visible.length > 0 &&
                            visible.every((r: any) => selected.includes(r.Id))
                          }
                          onChange={() => {
                            const ids = visible
                              .map((r: any) => r.Id)
                              .filter(Boolean);
                            setSelected(
                              ids.every((id: string) => selected.includes(id))
                                ? selected.filter((x) => !ids.includes(x))
                                : [...new Set([...selected, ...ids])],
                            );
                          }}
                        />
                      </th>
                      {columns.map((c) => (
                        <th key={c}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((r: any, i: number) => (
                      <tr
                        key={r.Id || i}
                        className={
                          r.Id && selected.includes(r.Id) ? "selected" : ""
                        }
                      >
                        <td className="select-cell">
                          <input
                            type="checkbox"
                            disabled={!r.Id}
                            checked={!!r.Id && selected.includes(r.Id)}
                            onChange={() =>
                              r.Id &&
                              setSelected(
                                selected.includes(r.Id)
                                  ? selected.filter((x) => x !== r.Id)
                                  : [...selected, r.Id],
                              )
                            }
                          />
                        </td>
                        {columns.map((c) => (
                          <td key={c} title={cellValue(r[c])}>
                            {cellValue(r[c])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                total={records.length}
                page={page}
                setPage={setPage}
                size={size}
                setSize={setSize}
              />
            </>
          ) : (
            <Empty
              icon={Database}
              title="No records"
              text="The query completed without returning records."
            />
          )}
        </section>
      )}
      {confirmDelete && (
        <div className="modal" onClick={() => setConfirmDelete(false)}>
          <div className="delete-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <span>
                <Trash2 />
                <b>
                  Delete {selected.length} {objectName} record(s)
                </b>
              </span>
              <button className="icon" onClick={() => setConfirmDelete(false)}>
                <X />
              </button>
            </div>
            <div className="confirm-body">
              <p>
                This changes the Salesforce org and may trigger automation. Type
                the confirmation exactly:
              </p>
              <code>
                DELETE {selected.length} RECORDS FROM {objectName}
              </code>
              <input
                autoFocus
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </div>
            <div className="modal-foot">
              <button
                className="secondary"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </button>
              <button
                className="primary danger"
                disabled={
                  confirmation !==
                    `DELETE ${selected.length} RECORDS FROM ${objectName}` ||
                  busy
                }
                onClick={deleteRecords}
              >
                <Trash2 /> Delete records
              </button>
            </div>
          </div>
        </div>
      )}
    </ConsoleLayout>
  );
}
function ConsoleLayout({ title, text, action, children }: any) {
  return (
    <section className="panel console">
      <div className="section-head">
        <div>
          <h3>{title}</h3>
          <p>{text}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
function Apex({ orgId, setError }: any) {
  const [code, setCode] = useState(
    "Account a = new Account(Name = 'Created from SF Dev Console');\ninsert a;\nSystem.debug('Created account: ' + a.Id);",
  );
  const [result, setResult] = useState<any>();
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      setResult(
        await api("/apex/execute", {
          method: "POST",
          body: JSON.stringify({ org: orgId, code }),
        }),
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <ConsoleLayout
      title="Anonymous Apex"
      text="Execute an Apex script through the local Salesforce CLI."
      action={
        <button className="primary" onClick={run} disabled={busy}>
          {busy ? <LoaderCircle className="spin" /> : <Play />} Execute
        </button>
      }
    >
      <textarea
        className="editor tall"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        spellCheck={false}
      />
      {result && (
        <div className="output">
          <Badge tone={result.success === false ? "red" : "green"}>
            {result.success === false ? "FAILED" : "SUCCESS"}
          </Badge>
          <pre>
            {result.logs || result.compiled === false
              ? JSON.stringify(result, null, 2)
              : JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </ConsoleLayout>
  );
}
function Tests({ orgId, setError }: any) {
  const [level, setLevel] = useState("RunLocalTests");
  const [tests, setTests] = useState("");
  const [result, setResult] = useState<any>();
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      setResult(
        await api("/tests", {
          method: "POST",
          body: JSON.stringify({
            org: orgId,
            testLevel: level,
            tests: tests
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean),
            coverage: true,
          }),
        }),
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <ConsoleLayout
      title="Apex test runner"
      text="Run tests and collect code coverage from your active org."
      action={
        <button className="primary" disabled={busy} onClick={run}>
          {busy ? <LoaderCircle className="spin" /> : <FlaskConical />} Run
          tests
        </button>
      }
    >
      <div className="form-grid">
        <label>
          Test level
          <select value={level} onChange={(e) => setLevel(e.target.value)}>
            <option>RunLocalTests</option>
            <option>RunAllTestsInOrg</option>
            <option>RunSpecifiedTests</option>
          </select>
        </label>
        {level === "RunSpecifiedTests" && (
          <label>
            Test classes
            <input
              value={tests}
              onChange={(e) => setTests(e.target.value)}
              placeholder="AccountServiceTest, QuoteServiceTest"
            />
          </label>
        )}
      </div>
      {busy && (
        <div className="loading">
          <LoaderCircle className="spin" />
          Tests are running. This can take several minutes…
        </div>
      )}
      {result && (
        <div className="output">
          <Badge tone="green">COMPLETE</Badge>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </ConsoleLayout>
  );
}
function OrgInfo({ orgId, setError }: any) {
  const [info, setInfo] = useState<any>();
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    api(`/orgs/${encodeURIComponent(orgId)}/info`)
      .then(setInfo)
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
  }, [orgId]);
  async function open() {
    try {
      await api(`/orgs/${encodeURIComponent(orgId)}/open`, { method: "POST" });
    } catch (e: any) {
      setError(e.message);
    }
  }
  if (busy)
    return (
      <div className="loading">
        <LoaderCircle className="spin" />
        Loading org details…
      </div>
    );
  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <h3>Organization details</h3>
          <p>Safe, non-sensitive information from Salesforce CLI.</p>
        </div>
        <button className="primary" onClick={open}>
          <ExternalLink /> Open Salesforce
        </button>
      </div>
      <div className="detail-grid">
        {Object.entries(info || {}).map(([k, v]) => (
          <div key={k}>
            <span>{k.replace(/([A-Z])/g, " $1")}</span>
            <b>{String(v || "—")}</b>
          </div>
        ))}
      </div>
      <div className="privacy">
        <ShieldCheck />
        <div>
          <h3>Credentials protected</h3>
          <p>
            Verbose org output and authorization URLs are intentionally never
            requested or returned to the browser.
          </p>
        </div>
      </div>
    </section>
  );
}
function HistoryPage() {
  const [items, setItems] = useState<any[]>([]);
  const load = () =>
    api<any>("/retrievals").then((r) => setItems(r.retrievals));
  useEffect(() => {
    load();
    const i = setInterval(load, 3000);
    return () => clearInterval(i);
  }, []);
  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <h3>Metadata retrievals</h3>
          <p>Stored as local JSON in your device workspace.</p>
        </div>
        <button className="secondary" onClick={load}>
          <RefreshCw /> Refresh
        </button>
      </div>
      {items.length ? (
        items.map((r) => (
          <div className="history-row" key={r.id}>
            <span className={`job-icon ${r.status}`}>
              {r.status === "running" ? (
                <LoaderCircle className="spin" />
              ) : r.status === "success" ? (
                <Check />
              ) : (
                <X />
              )}
            </span>
            <span>
              <b>{r.orgLabel} metadata</b>
              <small>
                {new Date(r.createdAt).toLocaleString()} · {r.componentCount}{" "}
                selections
              </small>
              {r.error && <small className="error-text">{r.error}</small>}
            </span>
            <Badge
              tone={
                r.status === "success"
                  ? "green"
                  : r.status === "failed"
                    ? "red"
                    : "blue"
              }
            >
              {r.status}
            </Badge>
            {r.status === "success" && (
              <a
                className="secondary button"
                href={`/api/retrievals/${r.id}/download`}
              >
                <FileArchive /> Download ZIP
              </a>
            )}
          </div>
        ))
      ) : (
        <Empty
          icon={History}
          title="No retrievals yet"
          text="Your metadata retrieval jobs will appear here."
        />
      )}
    </section>
  );
}
function Saved({ selections, setSelections }: any) {
  const [sets, setSets] = useState<any[]>([]);
  const [name, setName] = useState("");
  const load = () => api<any>("/saved-sets").then((r) => setSets(r.savedSets));
  useEffect(() => {
    load();
  }, []);
  async function save() {
    if (!name || !selections.length) return;
    await api("/saved-sets", {
      method: "POST",
      body: JSON.stringify({ name, selections }),
    });
    setName("");
    load();
  }
  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <h3>Saved selections</h3>
          <p>Reusable metadata groups stored only on this device.</p>
        </div>
      </div>
      <div className="save-bar">
        <input
          placeholder="Selection name (for example, Quote module)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          className="primary"
          disabled={!name || !selections.length}
          onClick={save}
        >
          <PackageCheck /> Save current selection
        </button>
      </div>
      {sets.length ? (
        sets.map((s) => (
          <div className="history-row" key={s.id}>
            <span className="job-icon success">
              <PackageCheck />
            </span>
            <span>
              <b>{s.name}</b>
              <small>
                {s.selections.reduce(
                  (n: number, x: Selection) => n + x.members.length,
                  0,
                )}{" "}
                selections · {new Date(s.createdAt).toLocaleDateString()}
              </small>
            </span>
            <button
              className="secondary"
              onClick={() => setSelections(s.selections)}
            >
              Load selection
            </button>
          </div>
        ))
      ) : (
        <Empty
          icon={PackageCheck}
          title="No saved selections"
          text="Select metadata, give the set a name, and save it for later."
        />
      )}
    </section>
  );
}
function ManifestTools({ orgId, setError }: any) {
  const [manifest, setManifest] = useState<any>();
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState<any>();
  async function upload(file: File) {
    setBusy("upload");
    try {
      const xml = await file.text();
      setManifest(
        await api("/manifests/upload", {
          method: "POST",
          body: JSON.stringify({ name: file.name, xml }),
        }),
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }
  async function run(kind: "preview" | "retrieve") {
    setBusy(kind);
    try {
      if (kind === "preview")
        setResult(
          await api("/retrievals/preview", {
            method: "POST",
            body: JSON.stringify({ org: orgId }),
          }),
        );
      else {
        await api("/retrievals/from-manifest", {
          method: "POST",
          body: JSON.stringify({ org: orgId, manifestId: manifest.id }),
        });
        setResult({
          message: "Manifest retrieval started. Track it in Retrieval history.",
        });
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="panel manifest-tools">
      <div className="section-head">
        <div>
          <h3>Existing package.xml</h3>
          <p>
            Upload a Salesforce manifest, preview source-tracking changes, or
            retrieve it as a ZIP.
          </p>
        </div>
        <Badge tone="blue">MANIFEST WORKFLOW</Badge>
      </div>
      <div className="manifest-drop">
        <FileArchive />
        <span>
          <b>{manifest?.name || "Choose package.xml"}</b>
          <small>
            {manifest
              ? `${manifest.size.toLocaleString()} bytes · validated locally`
              : "Salesforce Package namespace and version are validated"}
          </small>
        </span>
        <label className="secondary">
          {busy === "upload" ? (
            <LoaderCircle className="spin" />
          ) : (
            "Select file"
          )}
          <input
            type="file"
            accept=".xml,text/xml"
            hidden
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          />
        </label>
      </div>
      <div className="deploy-actions">
        <button
          className="secondary"
          onClick={() => run("preview")}
          disabled={!!busy}
        >
          {busy === "preview" ? <LoaderCircle className="spin" /> : <Search />}{" "}
          Preview retrieve changes
        </button>
        <button
          className="primary"
          onClick={() => run("retrieve")}
          disabled={!!busy || !manifest}
        >
          {busy === "retrieve" ? (
            <LoaderCircle className="spin" />
          ) : (
            <FileArchive />
          )}{" "}
          Retrieve uploaded manifest
        </button>
      </div>
      {result && (
        <div className="output">
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </section>
  );
}
function ObjectExplorer({ orgId, setError }: any) {
  const [objects, setObjects] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [describe, setDescribe] = useState<any>();
  const [counts, setCounts] = useState<any[]>([]);
  const [busy, setBusy] = useState("list");
  useEffect(() => {
    api<any>(`/orgs/${encodeURIComponent(orgId)}/objects?category=all`)
      .then((r) => setObjects(Array.isArray(r.objects) ? r.objects : []))
      .catch((e: any) => setError(e.message))
      .finally(() => setBusy(""));
  }, [orgId]);
  async function inspect(name: string) {
    setBusy(name);
    try {
      const r = await api<any>(
        `/orgs/${encodeURIComponent(orgId)}/objects/${name}`,
      );
      setDescribe(r.describe);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }
  async function count() {
    setBusy("counts");
    try {
      const r = await api<any>("/data/record-counts", {
        method: "POST",
        body: JSON.stringify({ org: orgId, objects: chosen }),
      });
      setCounts(r.counts);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }
  const shown = fuzzySearch(objects, search, (name) => name).slice(0, 500);
  return (
    <div className="object-layout">
      <section className="panel">
        <div className="section-head">
          <div>
            <h3>Salesforce objects</h3>
            <p>
              Browse standard and custom objects, schema, and record counts.
            </p>
          </div>
          <Badge>{objects.length} objects</Badge>
        </div>
        <label className="search">
          <Search />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search objects…"
          />
        </label>
        {busy === "list" ? (
          <div className="loading">
            <LoaderCircle className="spin" />
            Loading object catalog…
          </div>
        ) : (
          <div className="object-list">
            {shown.map((name) => (
              <div key={name}>
                <input
                  type="checkbox"
                  checked={chosen.includes(name)}
                  onChange={() =>
                    setChosen(
                      chosen.includes(name)
                        ? chosen.filter((x) => x !== name)
                        : chosen.length < 25
                          ? [...chosen, name]
                          : chosen,
                    )
                  }
                />
                <button onClick={() => inspect(name)}>{name}</button>
                <ChevronDown />
              </div>
            ))}
          </div>
        )}
        <button
          className="primary count-button"
          onClick={count}
          disabled={!chosen.length || !!busy}
        >
          {busy === "counts" ? <LoaderCircle className="spin" /> : <Gauge />}{" "}
          Count selected records ({chosen.length})
        </button>
      </section>
      <section className="panel schema-panel">
        {describe ? (
          <>
            <div className="section-head">
              <div>
                <h3>{describe.label || describe.name}</h3>
                <p>
                  {describe.name} · {describe.fields?.length || 0} fields
                </p>
              </div>
              <Badge tone={describe.custom ? "blue" : "neutral"}>
                {describe.custom ? "Custom" : "Standard"}
              </Badge>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Type</th>
                    <th>Properties</th>
                  </tr>
                </thead>
                <tbody>
                  {(describe.fields || []).map((f: any) => (
                    <tr key={f.name}>
                      <td>
                        <b>{f.label}</b>
                        <small>{f.name}</small>
                      </td>
                      <td>{f.type}</td>
                      <td>
                        {[
                          f.createable && "Create",
                          f.updateable && "Update",
                          f.nillable && "Nullable",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : counts.length ? (
          <>
            <div className="section-head">
              <div>
                <h3>Record counts</h3>
                <p>Live aggregate counts from the selected org.</p>
              </div>
              <button className="secondary" onClick={() => downloadCsv(counts)}>
                Export CSV
              </button>
            </div>
            <div className="count-grid">
              {counts
                .sort((a, b) => b.count - a.count)
                .map((c) => (
                  <div key={c.object}>
                    <span>{c.object}</span>
                    <b>{Number(c.count).toLocaleString()}</b>
                  </div>
                ))}
            </div>
          </>
        ) : (
          <Empty
            icon={Database}
            title="Select an object"
            text="Open an object to inspect fields, or select up to 25 objects to retrieve record counts."
          />
        )}
      </section>
    </div>
  );
}
function Activities() {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    api<any>("/activities").then((r) => setItems(r.activities));
  }, []);
  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <h3>Local operation history</h3>
          <p>
            The latest API operations on this device. No credentials or command
            arguments are stored.
          </p>
        </div>
        <Badge>{items.length} events</Badge>
      </div>
      {items.map((a) => (
        <div className="history-row" key={a.id}>
          <span
            className={`job-icon ${a.statusCode < 400 ? "success" : "failed"}`}
          >
            {a.statusCode < 400 ? <Check /> : <X />}
          </span>
          <span>
            <b>
              {a.method} {a.operation}
            </b>
            <small>{new Date(a.createdAt).toLocaleString()}</small>
          </span>
          <Badge tone={a.statusCode < 400 ? "green" : "red"}>
            {a.statusCode}
          </Badge>
        </div>
      ))}
    </section>
  );
}
const capabilityGroups = [
  {
    title: "Org management",
    description: "Work with Salesforce authorizations stored on this device.",
    icon: Cloud,
    items: [
      ["Authorized org selector", "List and switch between locally authorized orgs."],
      ["Browser authorization", "Authorize Production, Developer, or Sandbox orgs."],
      ["Authorization options", "Set an alias, preferred browser, default org, or Dev Hub."],
      ["Org information", "Review username, org ID, instance URL, status, and environment."],
      ["Open Salesforce org", "Launch the selected org directly in the browser."],
      ["Org limits", "Inspect API and platform capacity reported by Salesforce."],
      ["Installed packages", "Browse managed and unlocked packages with pagination."],
    ],
  },
  {
    title: "Metadata",
    description: "Discover, select, retrieve, and organize Salesforce metadata.",
    icon: Box,
    items: [
      ["Metadata type discovery", "Load metadata types supported by the selected org."],
      ["Component browser", "Expand a metadata type and browse its components."],
      ["Fuzzy metadata search", "Rank approximate matches across types and loaded components."],
      ["Multi-select metadata", "Select components individually or select an entire type."],
      ["Curated selection presets", "Quick-select Apex, frontend, objects, automation, or security."],
      ["Saved selections", "Save and reuse frequently retrieved component collections."],
      ["package.xml builder", "Generate a sorted Salesforce manifest from the selection."],
      ["package.xml upload", "Validate and use an existing local Salesforce manifest."],
      ["Retrieve preview", "Preview retrieval changes and source conflicts before running."],
      ["Metadata retrieval", "Retrieve selected components or an uploaded manifest."],
      ["Metadata ZIP download", "Download completed retrieval output in a portable archive."],
      ["Retrieval history", "Track local retrieval status, failures, and completed output."],
    ],
  },
  {
    title: "Data tools",
    description: "Explore schema and safely inspect or modify Salesforce records.",
    icon: Database,
    items: [
      ["SOQL query editor", "Execute SOQL through the local Salesforce CLI."],
      ["Tooling API queries", "Opt in per query to access Tooling API objects and fields."],
      ["Schema-aware autocomplete", "Suggest objects and fields with fuzzy matching."],
      ["SELECT field expansion", "Press Tab after SELECT to insert fields for the FROM object."],
      ["Scalable query results", "Review large result sets in a paginated, scrollable table."],
      ["Copy for Excel", "Copy all or selected query rows as tab-separated values."],
      ["Guarded record deletion", "Delete selected query records with exact confirmation."],
      ["Object explorer", "Browse standard and custom Salesforce objects."],
      ["Object describe", "Inspect field types and create, update, and nullability properties."],
      ["Record counts", "Count selected objects and export the results as CSV."],
      ["Record inspector", "Retrieve an individual record by object and Salesforce ID."],
      ["Field-level record editing", "Edit updateable fields with schema-appropriate controls."],
      ["Salesforce validation feedback", "Surface record update and validation errors in the UI."],
    ],
  },
  {
    title: "Apex and diagnostics",
    description: "Run Apex workflows and inspect execution diagnostics.",
    icon: Code2,
    items: [
      ["Anonymous Apex", "Execute anonymous Apex entered in the editor."],
      ["Apex test runner", "Run local, all-org, or specifically selected Apex tests."],
      ["Code coverage results", "Request and review Apex code coverage with test output."],
      ["Debug log browser", "List recent Salesforce debug logs with pagination."],
      ["Debug log viewer", "Download and inspect the full contents of an individual log."],
    ],
  },
  {
    title: "Deployments",
    description: "Preview and execute guarded metadata deployment workflows.",
    icon: Rocket,
    items: [
      ["Deployment preview", "Inspect source changes before modifying the target org."],
      ["Deployment validation", "Run a check-only deployment with Salesforce tests."],
      ["Asynchronous deployment", "Start a protected source deployment from a local project."],
      ["Deployment reporting", "Check deployment status and Salesforce result details by job ID."],
      ["Quick deploy", "Deploy a previously successful validation by job ID."],
      ["Deployment cancellation", "Cancel an active deployment request."],
      ["Destructive-action guards", "Require exact confirmations for deploy and delete operations."],
    ],
  },
  {
    title: "Local desktop platform",
    description: "Device-specific tooling without a hosted database or credential proxy.",
    icon: ShieldCheck,
    items: [
      ["Local Salesforce CLI bridge", "Run supported sf commands without exposing a terminal."],
      ["Database-free storage", "Keep preferences, selections, and history in local files."],
      ["Operation history", "Review recent local API operations and outcomes."],
      ["Collapsible workspace", "Use a responsive, expandable desktop navigation layout."],
      ["GitHub application updates", "Check, download, install, and restart from a GitHub Release."],
    ],
  },
] as const;
function Capabilities() {
  const [search, setSearch] = useState("");
  const total = capabilityGroups.reduce((count, group) => count + group.items.length, 0);
  const groups = capabilityGroups
    .map((group) => ({
      ...group,
      items: fuzzySearch([...group.items], search, (item) => [item[0], item[1], group.title]),
    }))
    .filter((group) => group.items.length);
  return (
    <section className="panel capability-page">
      <div className="capability-hero">
        <div>
          <Badge tone="blue">CURRENT APPLICATION SCOPE</Badge>
          <h2>Salesforce workflows, available now.</h2>
          <p>
            A verified inventory of features backed by the local Salesforce CLI and the
            current application interface.
          </p>
        </div>
        <div className="capability-total">
          <strong>{total}</strong>
          <span>available capabilities</span>
        </div>
      </div>
      <div className="capability-summary">
        <div><Box /><span><b>{capabilityGroups.length}</b> workflow modules</span></div>
        <div><ShieldCheck /><span><b>Local-first</b> security boundary</span></div>
        <div><Database /><span><b>No database</b> required</span></div>
      </div>
      <label className="search capability-search">
        <Search />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Fuzzy search capabilities…"
        />
        {search && <button className="icon" onClick={() => setSearch("")} title="Clear search"><X /></button>}
      </label>
      <div className="capability-groups">
        {groups.map(({ title, description, icon: Icon, items }) => (
          <section className="capability-group" key={title}>
            <div className="capability-group-head">
              <span><Icon /></span>
              <div><h3>{title}</h3><p>{description}</p></div>
              <Badge>{items.length} available</Badge>
            </div>
            <div className="capability-items">
              {items.map(([name, detail]) => (
                <article key={name}>
                  <span><Check /></span>
                  <div><b>{name}</b><p>{detail}</p></div>
                  <Badge tone="green">Available</Badge>
                </article>
              ))}
            </div>
          </section>
        ))}
        {!groups.length && (
          <Empty icon={Search} title="No matching capabilities" text="Try a broader name, workflow, or Salesforce feature." />
        )}
      </div>
      <div className="capability-boundary">
        <ShieldCheck />
        <div>
          <h3>Deliberate security boundary</h3>
          <p>
            Salesforce credentials remain in the CLI. Arbitrary terminal commands, raw access
            tokens, and unconfirmed destructive operations are not exposed to the browser UI.
          </p>
        </div>
        <Badge tone="blue">DEVICE SPECIFIC</Badge>
      </div>
    </section>
  );
}
function RecordInspector({ orgId, setError }: any) {
  const [sobject, setSobject] = useState("Account");
  const [id, setId] = useState("");
  const [record, setRecord] = useState<any>();
  const [fields, setFields] = useState<any[]>([]);
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  async function inspect(preserveMessage = false) {
    setBusy(true);
    if (!preserveMessage) setMessage("");
    try {
      const [data, schema] = await Promise.all([
        api<any>("/data/record", {
          method: "POST",
          body: JSON.stringify({ org: orgId, sobject, recordId: id }),
        }),
        api<any>(`/orgs/${encodeURIComponent(orgId)}/objects/${sobject}`),
      ]);
      setRecord(data);
      setFields(schema.describe?.fields || []);
      setDraft(
        Object.fromEntries(
          Object.entries(data).filter(([k]) => k !== "attributes"),
        ),
      );
      setEditing(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function beginEdit() {
    setDraft(
      Object.fromEntries(
        Object.entries(record).filter(([k]) => k !== "attributes"),
      ),
    );
    setEditing(true);
    setMessage("");
  }
  async function save() {
    const changes = Object.fromEntries(
      Object.entries(draft).filter(
        ([key, value]) =>
          value !== record[key] &&
          fields.some((f) => f.name === key && f.updateable),
      ),
    );
    if (!Object.keys(changes).length) {
      setError("No field values have changed.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await api("/data/record/update", {
        method: "POST",
        body: JSON.stringify({ org: orgId, sobject, recordId: id, changes }),
      });
      setMessage(
        `${Object.keys(changes).length} field${Object.keys(changes).length === 1 ? "" : "s"} updated successfully.`,
      );
      await inspect(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const metadata = new Map(fields.map((f) => [f.name, f]));
  const visible = fuzzySearch(
    Object.entries(record || {}).filter(([key]) => key !== "attributes"),
    search,
    ([key, value]) => [
      metadata.get(key)?.label || "",
      key,
      metadata.get(key)?.type || "",
      cellValue(value),
    ],
  );
  return (
    <section className="panel record-panel">
      <div className="section-head">
        <div>
          <h3>Record inspector</h3>
          <p>
            Retrieve, review, and update fields permitted by Salesforce
            field-level security.
          </p>
        </div>
        <div className="record-actions">
          {record && !editing && (
            <button className="secondary" onClick={beginEdit}>
              <Pencil /> Edit record
            </button>
          )}
          {editing && (
            <>
              <button
                className="secondary"
                onClick={() => {
                  setEditing(false);
                  setDraft(record);
                }}
              >
                Cancel
              </button>
              <button className="primary" disabled={busy} onClick={save}>
                {busy ? <LoaderCircle className="spin" /> : <Save />} Save
                changes
              </button>
            </>
          )}
          <button
            className="primary"
            disabled={busy || !id}
            onClick={() => inspect()}
          >
            {busy ? <LoaderCircle className="spin" /> : <SearchCode />} Inspect
          </button>
        </div>
      </div>
      <div className="form-grid">
        <label>
          SObject API name
          <input
            value={sobject}
            disabled={editing}
            onChange={(e) => setSobject(e.target.value)}
            placeholder="Account"
          />
        </label>
        <label>
          Salesforce record ID
          <input
            value={id}
            disabled={editing}
            onChange={(e) => setId(e.target.value)}
            placeholder="001…"
          />
        </label>
      </div>
      {record && (
        <>
          <div className="record-toolbar">
            <label className="search">
              <Search />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter fields…"
              />
            </label>
            <span>
              <b>{fields.filter((f) => f.updateable).length}</b> editable ·{" "}
              {fields.length} described
            </span>
          </div>
          <div className={`field-list ${editing ? "editing" : ""}`}>
            {visible.map(([key, value]) => {
              const field = metadata.get(key);
              const updateable = !!field?.updateable;
              return (
                <div
                  key={key}
                  className={editing && updateable ? "editable" : ""}
                >
                  <span>
                    {field?.label || key}
                    <small>
                      {key} · {field?.type || typeof value}
                    </small>
                  </span>
                  {editing && updateable ? (
                    <FieldInput
                      field={field}
                      value={draft[key]}
                      onChange={(v: any) =>
                        setDraft((d) => ({ ...d, [key]: v }))
                      }
                    />
                  ) : (
                    <code title={cellValue(value)}>
                      {cellValue(value) || "null"}
                    </code>
                  )}
                  {editing && !updateable && <Badge>Read only</Badge>}
                </div>
              );
            })}
          </div>
        </>
      )}
      {message && (
        <div className="bottom-toast success">
          <Check />
          <span>{message}</span>
          <button onClick={() => setMessage("")}>
            <X />
          </button>
        </div>
      )}
    </section>
  );
}
function FieldInput({
  field,
  value,
  onChange,
}: {
  field: any;
  value: any;
  onChange: (value: any) => void;
}) {
  if (field.type === "boolean")
    return (
      <label className="boolean-input">
        <input
          type="checkbox"
          checked={value === true || value === "true"}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{value === true || value === "true" ? "True" : "False"}</span>
      </label>
    );
  if (field.picklistValues?.length)
    return (
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">— None —</option>
        {field.picklistValues
          .filter((p: any) => p.active)
          .map((p: any) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
      </select>
    );
  if (field.type === "textarea")
    return (
      <textarea
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
      />
    );
  const type = ["double", "currency", "percent", "integer", "long"].includes(
    field.type,
  )
    ? "number"
    : field.type === "date"
      ? "date"
      : "text";
  return (
    <input
      type={type}
      value={value ?? ""}
      onChange={(e) =>
        onChange(
          type === "number" && e.target.value !== ""
            ? Number(e.target.value)
            : e.target.value,
        )
      }
      maxLength={field.length || undefined}
    />
  );
}
function DebugLogs({ orgId, setError }: any) {
  const [logs, setLogs] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>();
  const [busy, setBusy] = useState(true);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const load = () => {
    setBusy(true);
    api<any>(`/orgs/${encodeURIComponent(orgId)}/logs`)
      .then((r) => {
        setLogs(Array.isArray(r.logs) ? r.logs : []);
        setPage(1);
      })
      .catch((e: any) => setError(e.message))
      .finally(() => setBusy(false));
  };
  useEffect(load, [orgId]);
  async function view(id: string) {
    try {
      const r = await api<any>(`/orgs/${encodeURIComponent(orgId)}/logs/${id}`);
      setSelected(r.log);
    } catch (e: any) {
      setError(e.message);
    }
  }
  const visible = logs.slice((page - 1) * size, page * size);
  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <h3>Debug logs</h3>
          <p>Inspect Apex execution logs without leaving the console.</p>
        </div>
        <button className="secondary" onClick={load}>
          <RefreshCw /> Refresh
        </button>
      </div>
      {busy ? (
        <div className="loading">
          <LoaderCircle className="spin" />
          Loading debug logs…
        </div>
      ) : logs.length ? (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Operation</th>
                  <th>Time</th>
                  <th>Duration</th>
                  <th>Size</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((l: any) => (
                  <tr key={l.Id || l.id}>
                    <td>{l.LogUser?.Name || l.LogUserName || "—"}</td>
                    <td>{l.Operation || "—"}</td>
                    <td>{l.StartTime || "—"}</td>
                    <td>{l.DurationMilliseconds ?? "—"} ms</td>
                    <td>{l.LogLength ?? "—"}</td>
                    <td>
                      <button
                        className="link"
                        onClick={() => view(l.Id || l.id)}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            total={logs.length}
            page={page}
            setPage={setPage}
            size={size}
            setSize={setSize}
          />
        </>
      ) : (
        <Empty
          icon={ScrollText}
          title="No debug logs"
          text="No Apex logs are currently available in this org."
        />
      )}
      {selected && (
        <div className="modal" onClick={() => setSelected(undefined)}>
          <div onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <span>
                <ScrollText />
                <b>Debug log</b>
              </span>
              <button className="icon" onClick={() => setSelected(undefined)}>
                <X />
              </button>
            </div>
            <pre>
              {typeof selected === "string"
                ? selected
                : JSON.stringify(selected, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </section>
  );
}
function OrgLimits({ orgId, setError }: any) {
  const [limits, setLimits] = useState<any[]>([]);
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    api<any>(`/orgs/${encodeURIComponent(orgId)}/limits`)
      .then((r) =>
        setLimits(
          Array.isArray(r)
            ? r
            : Object.entries(r || {}).map(([name, v]: any) => ({ name, ...v })),
        ),
      )
      .catch((e: any) => setError(e.message))
      .finally(() => setBusy(false));
  }, [orgId]);
  if (busy)
    return (
      <div className="loading">
        <LoaderCircle className="spin" />
        Loading API limits…
      </div>
    );
  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <h3>Org consumption</h3>
          <p>Current limits and remaining capacity reported by Salesforce.</p>
        </div>
        <Badge>{limits.length} limits</Badge>
      </div>
      <div className="limit-grid">
        {limits.map((l: any, i) => (
          <div key={l.name || l.Name || i}>
            <div>
              <b>{l.name || l.Name}</b>
              <span>{l.remaining ?? l.Remaining ?? 0} remaining</span>
            </div>
            <progress
              max={Number(l.max ?? l.Max ?? 1)}
              value={Math.max(
                0,
                Number(l.max ?? l.Max ?? 1) -
                  Number(l.remaining ?? l.Remaining ?? 0),
              )}
            />
            <small>{l.max ?? l.Max ?? "—"} maximum</small>
          </div>
        ))}
      </div>
    </section>
  );
}
function Packages({ orgId, setError }: any) {
  const [items, setItems] = useState<any[]>([]);
  const [busy, setBusy] = useState(true);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  useEffect(() => {
    api<any>(`/orgs/${encodeURIComponent(orgId)}/packages`)
      .then((r) => setItems(Array.isArray(r.packages) ? r.packages : []))
      .catch((e: any) => setError(e.message))
      .finally(() => setBusy(false));
  }, [orgId]);
  const visible = items.slice((page - 1) * size, page * size);
  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <h3>Installed packages</h3>
          <p>Managed and unlocked packages currently installed in this org.</p>
        </div>
        <Badge>{items.length} packages</Badge>
      </div>
      {busy ? (
        <div className="loading">
          <LoaderCircle className="spin" />
          Loading packages…
        </div>
      ) : items.length ? (
        <>
          <div className="package-grid">
            {visible.map((p: any, i) => (
              <div key={p.SubscriberPackageId || i}>
                <Package />
                <span>
                  <b>
                    {p.SubscriberPackageName ||
                      p.SubscriberPackageNamespace ||
                      "Package"}
                  </b>
                  <small>
                    {p.SubscriberPackageVersionName ||
                      p.SubscriberPackageVersionNumber ||
                      "—"}{" "}
                    · {p.SubscriberPackageNamespace || "No namespace"}
                  </small>
                </span>
              </div>
            ))}
          </div>
          <Pagination
            total={items.length}
            page={page}
            setPage={setPage}
            size={size}
            setSize={setSize}
          />
        </>
      ) : (
        <Empty
          icon={Package}
          title="No installed packages"
          text="This org did not return any package installations."
        />
      )}
    </section>
  );
}
function Deploy({ orgId, setError }: any) {
  const [project, setProject] = useState(
    localStorage.getItem("sf-project-path") || "",
  );
  const [source, setSource] = useState("force-app");
  const [result, setResult] = useState<any>();
  const [busy, setBusy] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [jobId, setJobId] = useState("");
  async function run(kind: "preview" | "validate" | "start") {
    setBusy(kind);
    setResult(undefined);
    localStorage.setItem("sf-project-path", project);
    try {
      const r = await api<any>(`/deploy/${kind}`, {
        method: "POST",
        body: JSON.stringify({
          org: orgId,
          projectPath: project,
          sourcePath: source,
          testLevel: "RunLocalTests",
          confirmation,
        }),
      });
      setResult(r);
      const id = r.id || r.jobId || r.response?.id;
      if (id) setJobId(id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }
  async function job(kind: "report" | "quick" | "cancel") {
    setBusy(kind);
    try {
      const r =
        kind === "report"
          ? await api<any>(`/deploy/${encodeURIComponent(orgId)}/${jobId}`)
          : await api<any>(`/deploy/${kind}`, {
              method: "POST",
              body: JSON.stringify({ org: orgId, jobId, confirmation }),
            });
      setResult(r);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <h3>Deployment workbench</h3>
          <p>
            Preview, validate, deploy, and monitor metadata from a local
            Salesforce project.
          </p>
        </div>
        <Badge tone="red">ORG MUTATION</Badge>
      </div>
      <div className="deploy-warning">
        <ShieldCheck />
        <div>
          <b>Guarded deployment workflow</b>
          <p>
            Paths must stay inside a valid Salesforce project. Actual and quick
            deployments require an exact typed confirmation.
          </p>
        </div>
      </div>
      <div className="form-grid">
        <label>
          Salesforce project path
          <input
            value={project}
            onChange={(e) => setProject(e.target.value)}
            placeholder="/Users/me/projects/salesforce-app"
          />
        </label>
        <label>
          Source path inside project
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="force-app"
          />
        </label>
      </div>
      <div className="deploy-actions">
        <button
          className="secondary"
          disabled={!!busy || !project}
          onClick={() => run("preview")}
        >
          {busy === "preview" ? <LoaderCircle className="spin" /> : <Search />}{" "}
          Preview
        </button>
        <button
          className="secondary"
          disabled={!!busy || !project}
          onClick={() => run("validate")}
        >
          {busy === "validate" ? (
            <LoaderCircle className="spin" />
          ) : (
            <ShieldCheck />
          )}{" "}
          Validate only
        </button>
      </div>
      <div className="danger-zone">
        <div>
          <b>Deploy to {orgId}</b>
          <small>
            Type <code>DEPLOY {orgId}</code> to enable an asynchronous
            deployment.
          </small>
        </div>
        <input
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          placeholder={`DEPLOY ${orgId}`}
        />
        <button
          className="primary danger"
          disabled={!!busy || confirmation !== `DEPLOY ${orgId}`}
          onClick={() => run("start")}
        >
          {busy === "start" ? <LoaderCircle className="spin" /> : <Rocket />}{" "}
          Deploy metadata
        </button>
      </div>
      <div className="job-tools">
        <input
          value={jobId}
          onChange={(e) => setJobId(e.target.value)}
          placeholder="Deployment job ID (0Af…)"
        />
        <button
          className="secondary"
          disabled={!jobId || !!busy}
          onClick={() => job("report")}
        >
          Check status
        </button>
        <button
          className="secondary"
          disabled={!jobId || !!busy}
          onClick={() => job("cancel")}
        >
          Cancel
        </button>
      </div>
      <div className="quick-zone">
        <small>
          For a successful validation, type{" "}
          <code>QUICK DEPLOY {jobId || "0Af…"}</code>.
        </small>
        <button
          className="secondary"
          disabled={
            !jobId || confirmation !== `QUICK DEPLOY ${jobId}` || !!busy
          }
          onClick={() => job("quick")}
        >
          Quick deploy validated job
        </button>
      </div>
      {result && (
        <div className="output">
          <Badge tone="green">RESULT</Badge>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </section>
  );
}
function downloadCsv(records: any[]) {
  if (!records.length) return;
  const cols = Object.keys(records[0]).filter((k) => k !== "attributes");
  const csv = [
    cols.join(","),
    ...records.map((r) =>
      cols
        .map((c) => `"${String(r[c] ?? "").replaceAll('"', '""')}"`)
        .join(","),
    ),
  ].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = "salesforce-query.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}
function cellValue(value: any) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
function toTsv(records: any[], columns: string[]) {
  return [
    columns.join("\t"),
    ...records.map((r) =>
      columns
        .map((c) => cellValue(r[c]).replaceAll("\t", " ").replaceAll("\n", " "))
        .join("\t"),
    ),
  ].join("\n");
}
export default App;
