# Quillby App — Design Specification

> **Purpose:** Complete design rewrite brief. Ignore all current implementation. This document defines what each surface needs to accomplish and establishes the visual language — the AI has full creative latitude over layout, hierarchy, spacing, and interaction details.

---

## 1. Brand & Aesthetic

Quillby is a quiet, opinionated AI content agent. The visual identity is **dark, elegant, a little mysterious** — it should feel like a well-designed editorial tool, not a SaaS dashboard. Think: late-night writing session, focused, no noise.

### Tone
- Minimal and purposeful. Every element earns its place.
- Warm darkness — deep purple-black, not cold grey.
- Moments of delight through the violet accent and the brand mascot (a small owl-like character, `quillby.png`).
- Typographic personality: display serif for headlines, monospace for metadata/labels, sans for body.

### Logo / Mascot
- `/quillby.png` — circular crop, violet ambient glow. Use it on full-page auth/splash screens and in the nav wordmark.

---

## 2. Global CSS Theme

The app runs exclusively in **dark mode** (`class="dark" data-theme="dark"` on `<html>`). The CSS token set is fixed — do not change `global.css`.

### Available CSS Custom Properties
All as `var(--token)` in Tailwind v4 via `bg-(--token)` / `text-(--token)` syntax.

| Token | Role |
|---|---|
| `--background` | Page canvas (`oklch(12% …)` ≈ `#0c0915`) |
| `--foreground` | Primary text (near-white) |
| `--muted` | Secondary / muted text |
| `--accent` | **Violet** — the brand color. Use for interactive highlights, active states, glows, eyebrow labels. |
| `--accent-foreground` | Text on accent backgrounds |
| `--surface` | Card / panel backgrounds (elevated above page) |
| `--surface-secondary` | Second level elevation |
| `--surface-tertiary` | Third level elevation |
| `--border` | Subtle borders, dividers |
| `--separator` | Hairline rules |
| `--field-background` | Input / textarea fill |
| `--field-foreground` | Input text |
| `--field-placeholder` | Placeholder text |
| `--focus` | Focus ring (same as `--accent`) |
| `--danger` | Error / destructive |
| `--success` | Positive state |
| `--warning` | Warning state |
| `--overlay` | Modal / popover background |
| `--radius` | Base border-radius token (`0.25rem`) |
| `--field-radius` | Input border-radius token (`0.75rem`) |

### Typography Tokens
```
--font-sans:    'Nunito Variable'   → body copy, UI labels, descriptions
--font-display: 'Fraunces Variable' → page titles, headings, brand moments
--font-mono:    'DM Mono'           → eyebrow labels, metadata, code, keys
```

### Tailwind v4 Syntax Reminders
- CSS variable utilities: `bg-(--surface)`, `text-(--accent)`, `border-(--border)`
- `color-mix()` for tinted surfaces: `color-mix(in oklch, var(--accent) 8%, transparent)`
- No `dark:` prefix needed — the app is always dark

---

## 3. HeroUI v3 Component System

**Package:** `@heroui/react` (v3 beta, compound component pattern)  
**Import everything from:** `import { ... } from "@heroui/react"`

### Available Components
Use these — no custom primitives unless truly unavoidable.

| Component | Notes |
|---|---|
| `Button` | `variant`: `primary`, `secondary`, `ghost`, `danger`. `size`: `sm`, `md`, `lg`. |
| `Card` | Compound: `Card`, `Card.Header`, `Card.Body`, `Card.Footer` (use as needed) |
| `Tabs` | Compound: `Tabs`, `Tabs.ListContainer`, `Tabs.List`, `Tabs.Tab`, `Tabs.Indicator`, `Tabs.Panel`. `variant`: `default`, `secondary` |
| `TextField` | Compound: `TextField`, `Label`, `Input`, `Description` |
| `Form` | Wraps inputs, handles submit |
| `Select` | Compound: `Select`, `Select.ListContainer`, `Select.List`, `Select.Item`, `Select.Trigger`, etc. |
| `ListBox` | For option lists when Select.List is not appropriate |
| `Disclosure` | Accordion / expand-collapse pattern. Compound: `Disclosure`, `Disclosure.Trigger`, `Disclosure.Panel` |
| `Alert` | Compound: `Alert`, `Alert.Indicator`, `Alert.Content`, `Alert.Title`, `Alert.Description`. `status`: `danger`, `success`, `warning` |
| `Spinner` | Loading indicator |
| `Chip` | Badges/tags. `color`: `accent`, `default`, `success`, `danger`, `warning`. `variant`: `primary`, `secondary`, `outline` |
| `Avatar` | Compound: `Avatar`, `Avatar.Image`, `Avatar.Fallback` |
| `Dropdown` | Compound: `Dropdown`, `Dropdown.Trigger`, `Dropdown.Popover`, `Dropdown.Menu`, `Dropdown.Item` |

### HeroUI Philosophy in this App
- Prefer compound components over raw HTML wherever a component exists.
- Do not use `className="..."` to force HeroUI components into custom layouts — wrap them or use structural HTML around them.
- Glassmorphism / translucent surfaces are fine using `bg-(--surface)/80 backdrop-blur-xl` pattern.

---

## 4. Visual Language Patterns

The AI can and should use these idioms freely across all pages — they are the Quillby visual vocabulary.

### Radial Glow Backgrounds
Soft violet ellipses at the top of full-page (auth/splash) views.  
`radial-gradient(ellipse at 50% 0%, rgba(124,58,237,0.18) 0%, transparent 60%)`  
Combine with `var(--background)` as the base.

### Eyebrow Labels
Uppercase monospace micro-labels that categorize a section. Always with the `--accent` color. Typically preceded by a short horizontal line or decorative mark.  
Pattern: `[decorative mark] · LABEL TEXT`  
Use `--font-mono`, `tracking-widest`, small size (`0.65–0.72rem`), `text-(--accent)`.

### Display Headlines
Fraunces Variable for any `h1`–`h3` moment. Tight letter-spacing (`-0.02` to `-0.04em`). Mix weights — bold stems, light modifiers. Italic variant (`<em>`) for poetic/brand accents in a lighter weight within headings.

### Glow Effects
Violet box-shadows on brand logo, active states, key UI moments.  
`box-shadow: 0 0 Xpx rgba(167,139,250, opacity)`  
Use sparingly — glow is earned.

### Surfaces & Depth
Three levels of elevation using `--surface`, `--surface-secondary`, `--surface-tertiary`.  
Cards should feel slightly lifted from the page canvas. Use thin `border-(--border)` on cards.

### Monospace Metadata
API keys, server URLs, timestamps, IDs → always `font-mono`. Muted color. Never styled aggressively.

### Empty States
Should feel considered, not placeholder-ish. Use a decorative glyph or icon, a short serif headline, and a muted description. Offer a clear primary action if one exists.

### Destructive Actions
Require clear intent signals (danger color, confirmation pattern). Never ambiguous.

---

## 5. App Shell (Layout)

The persistent shell wraps every authenticated page.

### Navigation Bar
**What it must contain:**
- Brand identity (logo image + wordmark)
- Primary page navigation (Workspaces, Cards, Drafts, Connectors)
- Active workspace indicator (contextual — shown when a workspace is selected)
- User identity / account access (Cloud mode: user pill with sign-out + settings; Self-hosted mode: server URL + disconnect action)

**Behavior:**
- Sticky at top, always visible while scrolling
- Translucent / blurred against the page content behind it

### Main Content Area
- Constrained max-width, centered
- Consistent padding — breathable but not wasteful
- The nav and page content are the only two layout regions; no sidebar

---

## 6. Page Specifications

---

### 6.1 Home / Mode Selector (`/`)

**What it is:** A full-screen splash that exists only in `dev` deployment mode (production routes immediately to the right auth page). It lets a developer choose between Cloud mode and Self-hosted mode to preview both flows.

**Must show:**
- Brand presence — this is the first thing a developer sees, make it feel like Quillby
- Two mode options: "Quillby Cloud" and "Self-hosted server"
- Each mode has a name and a brief one-liner of what it means to the user
- Clear call-to-action for each mode

**Feel:** Welcoming, centered, a moment of "oh, this is nice." Full-page composition.

---

### 6.2 Cloud Auth (`/cloud`)

**What it is:** Sign-in / Sign-up for managed cloud accounts.

**Must show:**
- Brand anchoring (logo, product name, brief context line)
- Toggle between "Sign in" and "Create account" — these share the same surface
- Fields: email + password for sign-in; name + email + password for sign-up
- Submit action with loading state
- Error feedback inline
- Escape hatch: option to use a self-hosted server instead
- (Optional context) brief note about what "Quillby Cloud" means

**Feel:** Focused, single-purpose. Not cluttered. Auth should feel trustworthy and fast.

---

### 6.3 Self-hosted Connect (`/connect/self-hosted`)

**What it is:** Connection form for linking the frontend to a self-hosted Quillby MCP server.

**Must show:**
- Brand anchoring
- Two fields: Server URL and API Key
- Submit / "Connect" action with loading and success states
- Error feedback
- Escape hatch: option to use Quillby Cloud instead
- Brief explainer of what these credentials are (URL = the running server, API key = the bearer token configured in the server)

**Feel:** Technical but not intimidating. The connection form should feel safe and clear.

---

### 6.4 Workspaces (`/workspaces`)

**What it is:** The home base after authentication. Lists available workspaces and lets the user set the active one for the session.

**Must show:**
- Page identity (title / section heading)
- List of workspaces — each showing its name, its internal ID, and whether it's the currently active one
- Action to activate/select a workspace
- Loading and error states
- Refresh capability
- Empty state when no workspaces exist

**Feel:** Clean, scannable. The active workspace should be unmistakably identified. This is where users land after login — it should feel like "you're in."

---

### 6.5 Cards (`/cards`)

**What it is:** The curation dashboard. The backend harvests content "cards" from RSS feeds and other sources. Users approve, reject, or flag cards for use in draft generation.

**Must show:**
- Page identity
- Workspace selector (switch which workspace's cards you're viewing)
- Status filter (All, Pending, Approved, Rejected, Flagged — or a subset)
- List of cards — each showing: title, source/URL hint, status badge, summary (expandable or always visible)
- Per-card actions: Approve, Reject, Flag (only relevant non-current-status actions shown)
- Expanded card detail (summary text, full URL)
- Loading, error, and empty states

**Feel:** Editorial. Dense but not cramped. The curation act should feel deliberate and satisfying — approving a card should feel like a small gesture of intent.

---

### 6.6 Drafts (`/drafts`)

**What it is:** Generated content drafts — LinkedIn posts, newsletters, Threads threads — produced by the AI from approved cards.

**Must show:**
- Page identity
- Workspace selector
- List of drafts — each showing: title/name, content type (platform/format), date, and a preview of the draft content
- Copy-to-clipboard action per draft
- Expanded draft view showing the full content
- Loading, error, and empty states

**Feel:** Output surface. This is where the user sees the product of Quillby's work. Should feel satisfying, like opening a finished piece. Copy action should be frictionless.

---

### 6.7 Connectors (`/connectors`)

**What it is:** API key management for remote MCP clients (Claude Desktop, Claude.ai, other AI tools that connect via the Model Context Protocol).

**Must show:**
- Page identity + brief explanation of what connectors are for
- The MCP server URL (copyable) — this is what clients configure
- Form to create a new API key: key name (required), optional rate limit
- Newly created key revealed once (raw secret displayed then gone forever — make this clear)
- List of existing keys: name, creation date, rate limit, revoke action
- Revoke confirmation / loading state
- Error and empty states

**Feel:** Developer-facing but still beautiful. The "one-time reveal" of a new key is a security-critical moment — it should be visually distinct and memorable. Key list should be scannable with clear revoke affordance.

---

### 6.8 Settings (`/settings`)

**What it is:** Account management — identity, security, active sessions, and billing.

**Sections (all on one page, organized):**

**Profile**
- Display and edit: name, email
- Save action with loading and success states

**Security**
- Change password: current password + new password + confirm
- Save with validation

**Sessions**
- List of active sessions: browser/user-agent string, IP address, "current session" indicator
- Revoke individual session
- Revoke all other sessions (bulk action)

**Plan** *(cloud mode only)*
- Current plan name
- Link/action to manage billing (external)

**Danger Zone**
- Delete account (destructive — requires intentional confirmation)

**Feel:** Calm and organized. Each section should be visually distinct but the page should read as a unified document, not a pile of cards. Destructive actions live at the bottom and are clearly demarcated.

---

## 7. Interaction States

Every interactive surface must handle these:

| State | Expectation |
|---|---|
| **Loading** | Use `Spinner` from HeroUI. Disable the triggering button/action. Don't flash spinners for <200ms operations. |
| **Error** | Use `Alert` with `status="danger"`. Show inline near the action that caused it. |
| **Success** | Can be a brief `Alert status="success"` or a visible state change (e.g., button text changes). Don't use toasts. |
| **Empty** | Thoughtful empty state — not just "No items found." Give context and an action if possible. |
| **Disabled** | HeroUI handles disabled styling. Use `isDisabled` prop. |

---

## 8. What NOT to Do

- No light mode styles or `dark:` prefixes — the app is always dark
- No custom colors outside the token set — use only `var(--token)` values
- No external icon libraries — use Unicode symbols, emoji sparingly, or CSS shapes for decorative marks
- No toasts / floating notifications
- No sidebars or secondary navigation regions
- Don't change `global.css`
- Don't import from anywhere but `@heroui/react` for UI components
- Don't prescribe specific pixel values for spacing — use the Tailwind scale (`gap-4`, `p-6`, etc.) and CSS vars
- No modals — everything should render inline or in an expandable/disclosure pattern

---

## 9. File Map

```
apps/app/src/
  components/app/
    Layout.tsx              ← nav shell + shared primitives
    auth.ts                 ← DO NOT TOUCH
    api.ts                  ← DO NOT TOUCH
    pages/
      Home.tsx
      Cloud.tsx
      Connect.tsx
      Workspaces.tsx
      Cards.tsx
      Drafts.tsx
      Connectors.tsx
      Settings.tsx
  styles/
    global.css              ← DO NOT TOUCH
```

All design work lives in `Layout.tsx` and the `pages/` files. Logic, API calls, and state management in those files should be preserved exactly — only JSX structure, className, and inline styles are in scope.
