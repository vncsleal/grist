# Site Enhancement Plan

Based on live site comparison (quillby.vercel.app vs local).

## 5 new/modified sections

| Phase | What | Priority |
|---|---|---|
| **P1** | Install improvements — Linux tab, macOS/Win copy, 4-step right column, npm JSON, "then say" hint | High |
| **P2** | Before/after comparison — replace stats grid with comparison table | High |
| **P3** | Industry section — 12 niche cards in 4-col grid | High |
| **P4** | Testimonial pull quote — between FAQ and FinalCTA | Medium |
| **P5** | PT-BR language toggle — `/pt-br/` page + nav link | Optional |

## Current page order (keep)

Nav → Hero → Strip → **Problem (comparison)** → HowItWorks → CapabilitiesGrid → CampaignsPlanning → Personas → **Industry** → Install → TrustBanner → FAQ → **Testimonial** → FinalCTA → Footer

## Files to create/modify

| Action | File |
|--------|------|
| MODIFY | `src/pages/index.astro` — replace Problem section, add Industry/Testimonial imports |
| MODIFY | `src/components/Install.astro` — Linux tab, 4 steps, npm JSON, copy improvements |
| CREATE | `src/components/Industry.astro` — 12-card responsive grid |
| CREATE | `src/components/Testimonial.astro` — pull quote with CTA |
| MODIFY | `src/components/Nav.astro` — PT-BR toggle (if doing P5) |
| CREATE | `src/pages/pt-br/index.astro` — Portuguese translation (if doing P5) |

## Key design decisions

- **Problem**: Replace stats grid (40min, 6hrs, 70%) with a 2-column Before/After comparison. Same heading and lead paragraph. More visceral.
- **Industry**: 12 text-only cards, 4-col → 3-col → 2-col → 1-col responsive. No icons. Matches CapabilitiesGrid aesthetic.
- **Testimonial**: Light bg (`var(--bg-subtle)`) to not compete with FinalCTA's dark section. Large serif quote, center-aligned.
- **Install**: Add Linux tab (curl + copy). Rename npx tab to npm (add npm install + config JSON). 3 steps → 4 steps. Add "then say" hint.
- **PT-BR**: Parallel page, not Astro i18n. Docs already in Portuguese.

## OpenPlan states

- `S-000002` — LOCAL mode (parent)
- `S-000051` — Site content & design update
- `S-000053` → Industry section
- `S-000054` → Before/after comparison
- `S-000055` → Testimonial quote
- `S-000056` → Install improvements
- `S-000057` → PT-BR toggle
- `S-000058` → Polish existing sections
