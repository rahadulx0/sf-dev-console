# Product UI Design Specification

Use this document as the design and UX source of truth when implementing or restyling this product. Adapt the nouns, routes, data, and domain actions to the target application, but preserve the visual language, information hierarchy, interaction model, density, and responsive behavior described here.

The intended result is a polished professional operations/developer console: calm, precise, information-dense, fast to scan, and visually similar to Salesforce Lightning without copying Salesforce branding or product-specific content.

## 1. Design direction

The interface should feel like a dependable desktop workbench rather than a marketing website.

- Prefer clarity and operational confidence over decoration.
- Use a neutral application canvas, white working surfaces, thin borders, and a single blue accent.
- Keep corners modest and shadows shallow. This is not a soft, bubbly, oversized-card design.
- Use compact but comfortable controls. Default controls are 40 px high; compact controls are 32 px.
- Make complex data easy to scan using panels, tables, labelled values, badges, icon tiles, and predictable spacing.
- Keep navigation and global actions stable while page content scrolls independently.
- Use color semantically and sparingly. Blue means active/primary, green means success, amber means warning, and red means destructive/error.
- Icons support labels; they do not replace important labels except in familiar global controls with tooltips and accessible names.
- Avoid gradients, glassmorphism, excessive shadows, giant headings, oversized empty space, pill-shaped primary buttons, and decorative animation.

The visual character can be summarized as:

> Enterprise console + developer tool + Lightning-style information hierarchy + modern React-level responsiveness.

## 2. Technology and assets

The design is framework-agnostic. Implement it using the target project's existing framework and component approach.

- Use CSS custom properties for all shared design tokens.
- Use `lucide-react`, Lucide, or an equivalent consistent outline icon set.
- Use platform/system fonts; do not require a licensed brand font.
- Use a monospace stack for IDs, code, queries, file paths, commands, and machine-generated values.
- Build reusable primitives before styling individual pages: Button, IconButton, Badge, Panel, Field, SearchInput, Callout, Modal, Toast, EmptyState, LoadingState, Table, Pagination, and PageHeader.
- Do not introduce a large UI framework if the target project already has a workable component system.

## 3. Design tokens

Use these values as the baseline. Token names may be adapted to the target codebase, but components must consume semantic tokens rather than raw colors.

```css
:root {
  /* Typography */
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --font-mono: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;

  --fs-xs: 12px;
  --fs-sm: 13px;
  --fs-md: 14px;
  --fs-lg: 16px;
  --fs-xl: 20px;
  --fs-2xl: 24px;
  --fs-3xl: 32px;

  --lh-tight: 1.3;
  --lh-normal: 1.5;
  --lh-loose: 1.65;

  --fw-normal: 400;
  --fw-medium: 500;
  --fw-semibold: 600;
  --fw-bold: 700;

  /* Spacing: use this 4 px scale consistently */
  --s-1: 4px;
  --s-2: 8px;
  --s-3: 12px;
  --s-4: 16px;
  --s-5: 20px;
  --s-6: 24px;
  --s-8: 32px;
  --s-10: 40px;
  --s-12: 48px;

  /* Shape */
  --r-sm: 3px;
  --r-md: 4px;
  --r-lg: 8px;
  --r-full: 999px;

  /* Controls and shell */
  --control-h: 40px;
  --control-h-sm: 32px;
  --sidebar-w: 256px;
  --sidebar-collapsed-w: 64px;
  --topbar-h: 56px;
  --statusbar-h: 32px;
  --mobile-nav-h: 56px;
  --nav-row-h: 40px;
  --nav-tile: 32px;
  --nav-icon: 20px;

  --transition: 140ms cubic-bezier(0.4, 0, 0.2, 1);
  color-scheme: light;

  /* Light theme */
  --bg: #f3f3f3;
  --surface: #ffffff;
  --surface-2: #f3f3f3;
  --surface-3: #fafaf9;
  --surface-hover: #f3f3f3;
  --border: #e5e5e5;
  --border-strong: #c9c9c9;
  --text: #181818;
  --text-muted: #444444;
  --text-faint: #747474;
  --accent: #0176d3;
  --accent-hover: #014486;
  --accent-text: #ffffff;
  --accent-soft: #eef4ff;
  --accent-border: #d8e6fe;
  --success: #2e844a;
  --success-soft: #ebf7ec;
  --warn: #8c4b02;
  --warn-soft: #fef1e4;
  --danger: #ba0517;
  --danger-hover: #8e030f;
  --danger-soft: #fef1f1;
  --danger-border: #fdd9d9;
  --shadow-1: 0 2px 2px rgba(0, 0, 0, 0.05);
  --shadow-2: 0 2px 12px rgba(0, 0, 0, 0.16);
  --focus-ring: 0 0 0 1px var(--surface), 0 0 0 3px var(--accent);
}

:root[data-theme="dark"] {
  color-scheme: dark;
  --bg: #1a1b1e;
  --surface: #242529;
  --surface-2: #2e2f33;
  --surface-3: #1f2023;
  --surface-hover: #34353a;
  --border: #3a3b40;
  --border-strong: #4d4e54;
  --text: #f3f3f3;
  --text-muted: #c4c4c4;
  --text-faint: #949494;
  --accent: #57a3ff;
  --accent-hover: #7db8ff;
  --accent-text: #10233b;
  --accent-soft: rgba(87, 163, 255, 0.14);
  --accent-border: rgba(87, 163, 255, 0.36);
  --success: #45c65a;
  --success-soft: rgba(69, 198, 90, 0.14);
  --warn: #f0a25a;
  --warn-soft: rgba(240, 162, 90, 0.14);
  --danger: #fe7c73;
  --danger-hover: #ff9a93;
  --danger-soft: rgba(254, 124, 115, 0.14);
  --danger-border: rgba(254, 124, 115, 0.36);
  --shadow-1: 0 2px 2px rgba(0, 0, 0, 0.3);
  --shadow-2: 0 2px 16px rgba(0, 0, 0, 0.5);
  --focus-ring: 0 0 0 1px var(--surface), 0 0 0 3px var(--accent);
}
```

No component stylesheet should contain a new raw UI color unless it is an exceptional content-specific visualization. Add or reuse a semantic token instead.

## 4. Typography

- Body text: 14 px, normal weight, 1.5 line height.
- Supporting text, labels, timestamps, and table headers: 12–13 px.
- Panel titles and top-bar page titles: 16 px, bold.
- Main page title: 24 px, bold, tight line height, slight negative letter spacing.
- Large setup/onboarding title only: up to 32 px.
- Use sentence case for titles, actions, table headers, and navigation.
- Use bold intentionally for hierarchy, never for whole paragraphs.
- Truncate long identifiers and single-line labels with an ellipsis; expose the complete value with `title`, tooltip, expandable content, or copy action.
- Use monospace at 13–14 px for IDs, code, logs, queries, paths, and technical output.
- Uppercase is reserved for small navigation group labels and section dividers: 12 px, bold, 0.06–0.08 em tracking.

## 5. Application shell

The desktop layout fills the viewport and prevents the browser body from scrolling.

```text
┌──────────────────────┬──────────────────────────────────────────────┐
│ Brand + collapse     │ Page title        Search  Refresh  Theme     │ 56
├──────────────────────┤──────────────────────────────────────────────┤
│ Context switcher     │                                              │
│                      │ Page content (the only main scroll region)   │
│ Grouped navigation   │                                              │
│                      │                                              │
│                      ├──────────────────────────────────────────────┤
│                      │ Optional running-job strip                   │
│                      ├──────────────────────────────────────────────┤
│                      │ Page · context             ● Connected       │ 32
└──────────────────────┴──────────────────────────────────────────────┘
       256 px
```

### Desktop sidebar

- Width: 256 px expanded, 64 px collapsed.
- Surface background with a 1 px right border; no heavy shadow.
- Brand row is exactly 56 px high and aligns with the top bar.
- Brand mark is a 32 px square, 4 px radius, solid accent background, with a 20 px white/contrast icon.
- A context/workspace/account switcher sits below the brand when relevant. It is a bordered compact card with a primary label, faint secondary label, status dot, and caret.
- Organize routes into short labelled groups rather than one undifferentiated list.
- Navigation rows are 40 px high. Each has a 32 px square icon tile, text label, and optional count badge.
- Inactive navigation uses muted text and neutral icon tiles.
- Hover uses a neutral surface tint.
- Active navigation uses `accent-soft`; its label is accent-colored and semibold, and its icon tile becomes solid accent.
- Keep the navigation area independently scrollable.
- Persist the user's collapsed/expanded preference.
- In collapsed mode, hide text and center the tiles. Show a portaled tooltip on hover and keyboard focus so it cannot be clipped by the rail's overflow.

### Top bar

- Height: 56 px; white/surface background; 1 px bottom border.
- Show the current page title and, on desktop, a single-line faint description below it.
- Put flexible space between the title and global actions.
- Include a command/search trigger around 260 px wide, followed by compact icon buttons for relevant global actions and theme.
- The search trigger resembles a compact input and displays the keyboard shortcut.
- Icon-only buttons must have tooltips/titles and `aria-label` where the visible meaning is absent.

### Content region

- The content region scrolls independently and uses `--bg`.
- Desktop padding: 24 px. Mobile padding: 12 px.
- Place content in a vertical stack with 16 px gaps.
- Maximum content width: 1600 px, centered. The layout should still feel full-width and useful on large monitors.
- Avoid arbitrary one-off margins; spacing should normally come from stack/grid gaps and component padding.

### Phone navigation

- On phone widths, replace the desktop sidebar with a fixed icon-only navigation bar at the bottom of the viewport.
- The bar is 56 px high, uses the surface background, and has a 1 px top border. Page content must include bottom padding for the full bar height plus the device safe-area inset.
- Do not show text labels under or beside the phone navigation icons.
- Divide the full available width into equal grid columns—one assigned segment per icon. Each item owns exactly the width from its segment's start to the next icon's segment.
- The clickable navigation item fills its entire assigned segment: `width: 100%` and `height: 100%`. Do not put the state highlight on a smaller rounded icon tile.
- Active, pressed, and hover/focus backgrounds fill the full navigation-bar height and the full assigned segment width. Use square corners so adjacent segments meet cleanly without gaps or overlap.
- The active item uses `accent-soft` for its full-cell background and `accent` for the icon. Inactive icons use `text-muted`.
- Center a 20–22 px icon inside each segment. There is no separate icon-tile background on phone.
- Give every icon-only item an `aria-label`, `title`, and `aria-current="page"` when active.
- Keep four or five primary destinations directly visible. If the product has more routes, use the last segment as a “More” icon that opens a menu/sheet; do not squeeze an unlimited number of icons into the bar.
- Account/workspace switching and secondary routes belong in the “More” surface or a top-bar menu on phone.

Reference layout and state sizing:

```css
.mobile-nav {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 50;
  display: grid;
  grid-template-columns: repeat(var(--mobile-nav-items), minmax(0, 1fr));
  height: calc(var(--mobile-nav-h) + env(safe-area-inset-bottom));
  padding-bottom: env(safe-area-inset-bottom);
  border-top: 1px solid var(--border);
  background: var(--surface);
}

.mobile-nav-item {
  display: grid;
  place-items: center;
  width: 100%;
  height: var(--mobile-nav-h);
  border-radius: 0;
  color: var(--text-muted);
}

.mobile-nav-item:hover,
.mobile-nav-item:focus-visible,
.mobile-nav-item.is-active {
  background: var(--accent-soft);
  color: var(--accent);
}

.mobile-nav-item svg {
  width: 22px;
  height: 22px;
}
```

### Status and jobs

- A 32 px bottom status bar is always visible when useful for an operations-oriented product.
- Use 12 px faint text, subtle separators, and a right-aligned green status dot with a concise connection/status label.
- Show current page, current workspace/context, and compact environment status. Hide lower-priority details on mobile.
- Long-running operations appear in an optional strip immediately above the status bar. Use a pale accent background and horizontally scrollable pill-shaped job items with a spinner, label, and elapsed time.
- Never block the whole application just because a background job is running unless the current action truly cannot continue.

## 6. Page composition

Each route should use one of these predictable compositions.

### Standard page

Use a vertical `page-stack` of panels, callouts, tables, grids, and empty states. The top bar already names the route, so do not repeat a large decorative hero on every page.

### Entity or workspace overview

Use a Lightning-style page header when the page centers on a selected entity, workspace, environment, customer, project, or account.

- White bordered surface with a shallow shadow and 4 px radius.
- Padding: 20 px vertically, 24 px horizontally.
- Top row: 48 px solid accent icon tile, eyebrow, 24 px title, and right-aligned actions.
- Primary action is last/rightmost and filled blue.
- Below, add a bordered details row using an auto-fit grid of labelled values.
- Detail labels are 13 px faint text; values are 14 px semibold.

### Multi-column pages

- Common two-column layout: `repeat(auto-fit, minmax(360px, 1fr))`, 16 px gap.
- Shortcut grid: `repeat(auto-fit, minmax(250px, 1fr))`, 16 px gap.
- Stat grid: `repeat(auto-fit, minmax(180px, 1fr))`, 16 px gap.
- For a main workspace plus secondary rail, use `minmax(0, 1fr) minmax(300px, 360px)`.
- Collapse split layouts to one column below roughly 1100 px.
- Always place `min-width: 0` on grid/flex children that contain potentially long content.

## 7. Core components

### Panels

- Surface background, 1 px neutral border, 4 px radius, shallow `shadow-1`.
- Panel header: flexible title/description block and optional action group; 16 px vertical and 24 px horizontal padding; bottom border.
- Panel title: 16 px bold. Description: 13 px faint with 4 px top spacing.
- Panel actions may wrap below the title rather than compressing it.
- Panel body padding: 24 px. Use a flush variant for tables or content that should meet the edges.
- Do not nest multiple shadowed cards without a strong structural reason.

### Buttons

All button styles are 4 px radius, 14 px medium text, inline-flex, centered, with an 8 px icon gap. Icons are 16 px.

- Default: white surface, strong neutral border, accent text.
- Primary: solid accent background and contrast text.
- Ghost: transparent border/background and muted text; used for chrome and low-emphasis actions.
- Destructive outline: neutral border with red text, red-tinted hover.
- Danger: solid red, reserved for the final destructive confirmation.
- Link button: no box, normal weight, accent text; underline on hover.
- Default height: 40 px with 16 px horizontal padding.
- Small height: 32 px with 12 px horizontal padding.
- Icon button: square, matching the relevant control height.
- Disabled controls remain legible but clearly inactive, using neutral surfaces and faint text.
- Within an action group, place primary actions after secondary actions.

### Forms

- Labels sit above controls in 13 px muted text with 4 px bottom spacing.
- Optional help text sits under the label at 12 px faint text.
- Inputs, selects, and textareas are white/surface, 1 px strong border, 4 px radius, and 40 px high.
- Focus changes border to accent and adds a 1 px accent ring.
- Placeholder text uses the faint color.
- Textareas use 12 px padding and vertical resize unless they auto-grow.
- Use responsive form grids: `repeat(auto-fit, minmax(240px, 1fr))` with 16 px gaps.
- Search inputs combine a 16 px faint search icon and borderless internal input inside the standard control shell.
- Boolean toggles may be compact bordered label+checkbox controls. Checked state uses the accent-soft background and accent border/text.
- Put validation messages close to the relevant control. Use plain language and state how to resolve the issue.

### Badges and status

- Badges are 24 px high, pill-shaped, 12 px medium text, with 12 px horizontal padding.
- Neutral badges use a subtle grey fill and border.
- Accent, success, warning, and danger badges use pale semantic fills and semantic text.
- Use badges for short states or counts, not sentences.
- A status dot is 8 px and always paired with text when meaning matters.

### Tables

- Wrap tables in their own bordered, 4 px radius, overflow container.
- Use `border-collapse: separate` and zero spacing.
- Headers are sticky, surface-3 background, 13 px semibold muted text, and left aligned.
- Cells use 12 px vertical and 16 px horizontal padding with bottom separators.
- Rows receive only a subtle neutral hover background.
- Selected rows use accent-soft.
- Keep operational tables horizontally scrollable rather than crushing columns.
- Truncate cells at a sensible maximum width (around 340 px), but provide the full value through title/inspection/copy behavior.
- IDs and technical values use monospace.
- Checkbox columns are narrow and centered.
- Use pagination below the table: result range on the left; page size and previous/current/next controls on the right.
- For large data sets, use real pagination or virtualization rather than rendering everything.

### Rows and list items

- Repeated list rows use a 1 px divider, 12 px vertical rhythm, and a flexible main text block.
- Main label: 14 px medium. Secondary line: 13 px faint.
- Use a 32 px icon tile to communicate item type/state.
- The trailing area may contain a badge or compact action.

### Shortcut cards

- Use clickable bordered surfaces with 16 px padding and a 40 px pale accent icon tile.
- Title is 14 px medium; supporting line is 13 px faint.
- On hover, change the border to accent, increase to `shadow-2`, and turn the icon tile solid accent.
- Keep the entire card clickable and keyboard accessible.

### Stats and labelled details

- Stat cards are compact bordered surfaces with 16 px padding.
- Use an 18 px accent icon, 24 px bold value, and 13 px faint label.
- Use progress bars only when total capacity is meaningful. Bars are 6 px tall, rounded, and use semantic warning/danger colors at appropriate thresholds.
- For dense labelled data, use a grid with 1 px gaps and the border color as the grid background, producing precise separators without nested borders.

### Callouts

- Use a 20 px icon, title, and optional supporting text inside a 16 px padded bordered surface.
- Neutral callouts use the standard surface.
- Informational callouts use accent-soft and accent-border.
- Destructive/warning callouts use the appropriate soft semantic background.
- Callouts explain context or risk; do not use them as decorative banners.

### Empty, loading, and error states

- Never leave a blank panel.
- Empty states are centered with 48 px vertical padding, a 32 px low-opacity icon, 16 px semibold title, and concise 14 px supporting copy no wider than about 360 px.
- Loading states use an 18 px spinner plus a specific label such as “Loading projects…” rather than a generic indefinite screen.
- Preserve surrounding layout while loading to prevent large jumps.
- Display recoverable page errors in context with a retry action. Use toasts for action feedback, not as the only durable representation of a page failure.

### Code and editor surfaces

- Code blocks use surface-3, a border, 4 px radius, 16 px padding, 13 px monospace text, and a loose 1.65 line height.
- Editors use the normal surface with a stronger border, 14 px monospace text, 1.7 line height, and a visible accent focus ring.
- Prefer content-aware auto-growth up to a reasonable maximum, then internal scrolling.
- Autocomplete menus are anchored overlays with a surface background, border, 4 px radius, and `shadow-2`. Active options use accent-soft.
- Show editor state/status below the editor in 13 px faint text. Put keyboard shortcuts close to the action they invoke.

## 8. Overlays and transient feedback

### Modal dialogs

- Backdrop: fixed, full viewport, approximately `rgba(24, 24, 24, 0.6)`.
- Standard modal width: `min(720px, 100%)`; wide variant: `min(960px, 100%)`.
- Maximum height: about `min(82vh, 760px)` with an independently scrollable body.
- Modal radius: 8 px; border plus `shadow-2`.
- Header and footer remain visible while the body scrolls.
- Header contains an optional accent icon, 20 px bold title, and a close icon button.
- Footer is a slightly tinted surface with actions right aligned. Cancel precedes confirm.
- Close on Escape and outside click unless an in-progress non-cancellable action would make that unsafe.
- Use `role="dialog"`, `aria-modal="true"`, labelled title, initial focus, focus containment, and restore focus to the trigger on close.

### Destructive confirmation

- Explain the effect and scope in plain language.
- For irreversible or high-impact operations, require typing an exact phrase that contains the action and target.
- Keep the final red button disabled until the phrase matches.
- Prevent accidental dialog dismissal while the destructive request is in flight.
- UI confirmation is a deliberate speed bump, not the authorization/security boundary; validate again in the backend.

### Toasts

- Place toasts centered below the top bar, maximum width around 520 px, stacking up to four visible items.
- Use solid semantic backgrounds with white text: blue/info, green/success, red/error.
- Include a 20 px icon, bold title, optional detail, optional action, and dismiss button.
- Suggested durations: success 4.5 seconds, info 6 seconds, error 9 seconds.
- Toasts are non-blocking and use an appropriate live-region/status role.
- Important errors must also remain discoverable in their page context.

### Menus and tooltips

- Overlay menus use a surface background, border, 4 px radius, and `shadow-2`.
- Menu rows use 8 px vertical/12 px horizontal padding, a clear selected state, and text truncation.
- Portal menus/tooltips to the document body when an ancestor has overflow clipping.
- Collapsed-navigation tooltips are dark high-contrast labels, 28 px high, offset roughly 10 px from the rail.

## 9. Command palette and keyboard UX

Provide a global command palette for a multi-page productivity application.

- Open with `Cmd+K` on macOS and `Ctrl+K` elsewhere; the top bar exposes the shortcut.
- Width: up to 600 px. Position near the top at approximately 12 vh rather than exact center.
- Search pages, entities/workspaces, and global actions with fuzzy matching.
- Group results under small uppercase headings.
- Support Arrow Up/Down with wraparound, Enter to run, Escape to close, mouse hover to set the active row, and automatic scrolling to keep the active row visible.
- Input receives focus immediately.
- The footer teaches the keyboard controls using small keyboard chips.
- Close after an action is selected.
- Keep keyboard behavior consistent in other searchable pickers and autocomplete menus.

## 10. Theme behavior

- Provide both light and dark themes by redefining semantic color tokens only. Component CSS should not need theme-specific selectors.
- Light is the default for this particular visual language unless the product already has a defined default.
- Persist explicit user choice in local storage or the target platform's preference store.
- Set `color-scheme` so native controls match the theme.
- Use a moon icon in light mode and sun icon in dark mode to represent the available action.
- Test every semantic state, border, input, overlay, table, and code surface in both themes. Avoid “half-themed” components.

## 11. Responsive behavior

### Up to 1100 px

- Collapse main+rail and object/detail split layouts to one column.
- Hide secondary decorative/onboarding artwork.

### Up to 860 px

- Hide the desktop sidebar and replace it with the fixed icon-only bottom navigation described in “Phone navigation.”
- Do not display navigation text labels on phone.
- Each phone navigation icon receives one equal-width grid segment; its active highlight fills that segment's complete width and the navigation bar's complete 56 px content height.
- Do not show a menu icon merely to reproduce the desktop navigation. Use a “More” segment only when secondary routes or context actions need somewhere to live.
- Hide the top-bar page description.
- Reduce page padding from 24 px to 12 px.
- The command palette trigger becomes a compact icon control or consumes only available flexible width; hide its text and shortcut chip when space is tight.
- Page-header actions take the full row and share available width.
- Complex action rows, search toolbars, save bars, danger zones, and editable field rows stack vertically.
- Collapse all feature grids to one column when their minimum useful width cannot be maintained.
- Keep data tables horizontally scrollable.
- Hide low-priority status-bar details, never the primary state.
- Hide the desktop status bar when it would compete with the bottom navigation, or place only essential connection state above the navigation in a compact non-overlapping strip.
- Add `calc(var(--mobile-nav-h) + env(safe-area-inset-bottom))` to the bottom of the main content so the last controls cannot be covered by navigation.
- Toast width becomes `calc(100vw - 24px)`.

Do not build a separate “mobile-looking” visual language. Preserve the same surfaces, hierarchy, tokens, and control styles while changing composition.

## 12. Motion

- Most hover/focus/layout transitions: 140 ms using `cubic-bezier(0.4, 0, 0.2, 1)`.
- Backdrop fade: approximately 100–120 ms.
- Modal/menu/toast entrance: fade plus a subtle 6 px upward rise over 120–160 ms.
- Spinner: linear rotation around 0.9 seconds.
- Do not animate routine page layout heavily or use spring/bounce effects.
- Honor `prefers-reduced-motion: reduce` by reducing animations and transitions to effectively instant.

## 13. Accessibility

- Everything interactive must work with a keyboard.
- Use semantic HTML: `button`, `nav`, `main`, `aside`, `header`, `footer`, `table`, proper headings, and associated `label` elements.
- Use `aria-current="page"` on active navigation.
- Give icon-only controls accessible names and visible hover/focus tooltips where needed.
- Apply a consistent `:focus-visible` ring using `--focus-ring`; do not remove focus indication.
- Ensure text and controls meet WCAG AA contrast in both themes.
- Do not communicate state with color alone; pair it with text, icon, shape, or badge.
- Modal dialogs and command palettes must manage initial focus, trap focus, close on Escape when safe, and restore focus on close.
- Use appropriate live regions for asynchronous success/error feedback.
- Respect reduced motion.
- Keep interactive targets at least 32 px; use 40 px for standard controls.
- Provide visible labels for unfamiliar actions. Tooltips do not replace necessary instructions.

## 14. UX behavior and product writing

- Use concise, concrete labels: “Run query,” “Save selection,” “Refresh,” “Open project.”
- Pair technical page titles with one short description that explains purpose.
- Explain risks before actions that mutate or delete data.
- Prefer non-blocking feedback and allow unrelated work to continue during background operations.
- Show elapsed time for long-running actions when real percentage progress is unavailable. Do not fabricate progress.
- When data is cached, state its age and provide a nearby refresh action. Fast data must not become silently stale data.
- Keep the user's drafts and shell preferences when practical.
- Disable actions while they are invalid or already running, and change the label/icon to communicate progress.
- Make empty-state copy specific: what is absent, why it might be absent, and what the user can do next.
- Surface errors in plain language, retain useful technical detail, and offer a retry or corrective next step.
- Use confirmation dialogs only for meaningful decisions, not routine operations.
- Preserve back/forward navigation and direct URLs for routes and selected entities when the target platform supports them.

## 15. Implementation architecture

Keep styling organized by responsibility:

```text
styles/
  tokens.css       semantic colors, type, spacing, shape, layout constants
  base.css         reset, document defaults, focus, scrollbar, motion
  components.css   reusable primitives
  shell.css        sidebar, top bar, page scroller, status, palette
  features.css     page-specific layouts only
```

Recommended composition:

```text
ThemeProvider
└── ToastProvider
    └── AppShell
        ├── Sidebar
        │   ├── Brand
        │   ├── ContextSwitcher
        │   └── GroupedNavigation
        └── Main
            ├── TopBar
            ├── ScrollablePage
            │   └── PageStack
            ├── BackgroundJobStrip (conditional)
            └── StatusBar
        └── MobileNavigation (phone widths only)
```

- Route-level pages may be lazy loaded; show a labelled loading state in the content region.
- Use an error boundary or equivalent around route content so one page failure does not destroy the shell.
- Centralize navigation metadata—route key, label, description, group, and icon—so the sidebar, top bar, document title, and command palette stay consistent.
- Centralize reusable status tones and component variants instead of creating page-specific approximations.
- Avoid inline styles except for truly dynamic measurements. Repeated values belong in classes/tokens.

## 16. Adaptation rules for another project

When applying this design to a different repository:

1. Audit the current routes, entities, actions, forms, tables, and user roles before changing markup.
2. Preserve existing business logic, API behavior, validations, permissions, and test selectors unless a change is required for accessible markup.
3. Map the target product's routes into 3–5 understandable navigation groups.
4. Choose the most important current entity/workspace/account as the sidebar context switcher; omit the switcher if the product has no such concept.
5. Use the target project's brand name and icon while retaining the shell proportions and component language.
6. Keep domain-specific color only where it carries real meaning. The global UI remains neutral with one blue accent.
7. Convert repeated markup into shared primitives before finishing all pages so variants stay consistent.
8. Implement the shell and tokens first, core components second, representative pages third, then migrate remaining pages.
9. Test with realistic long names, empty data, loading, server errors, large tables, narrow screens, dark mode, and keyboard-only navigation.
10. Do not merely recolor the old interface. Recompose pages to follow the hierarchy and patterns in this specification.

## 17. Definition of done

The UI redesign is complete only when all applicable items below are true.

- The fixed shell, desktop sidebar, top bar, page scroller, and icon-only phone navigation behave as specified.
- Every phone navigation item owns an equal-width, full-height hit area; its highlight fills that entire segment and no text label is rendered.
- Navigation is grouped, clearly indicates the active route, supports collapse, and remains keyboard accessible.
- Light and dark themes use semantic tokens and persist the user's choice.
- Buttons, inputs, panels, tables, badges, callouts, modals, toasts, empty states, and loading states use shared components and consistent variants.
- Every route has a deliberate hierarchy and works at desktop, tablet, and mobile widths.
- Long content and tables overflow gracefully without breaking the layout.
- All async operations expose loading, success, empty, and failure states.
- Destructive actions communicate scope and require proportionate confirmation.
- Keyboard focus is always visible; modal and palette keyboard behavior is complete.
- Reduced-motion behavior is present.
- No major component uses unexplained raw colors, arbitrary spacing, or inconsistent border radii.
- The interface contains no gradients, glass effects, oversized pill buttons, ornamental animation, or marketing-style hero sections unless the target product explicitly needs them.
- Existing product functionality and permission boundaries still work after the redesign.
- The final result feels like one coherent professional tool, not a collection of separately styled screens.
