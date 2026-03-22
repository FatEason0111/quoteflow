# Pricetool UI System

## Product Assumptions

- Product type: pricing intelligence workspace for procurement and quote operations
- Primary users: sourcing managers, analysts, procurement leads
- Visual direction: quiet enterprise minimalism with SUSE-inspired green accents
- Core goal: review prices fast, compare suppliers clearly, act on alerts with low friction

## Core Navigation

1. Overview
2. Watchlist
3. SKU Detail
4. Alerts
5. Quote Builder
6. Suppliers
7. Settings

## Visual System

- Typeface: SUSE
- Base background: white and soft mint surfaces
- Primary ink: `#0C322C`
- Accent green: `#30BA78`
- Soft mint: `#EAFAF4`
- Divider: `#DCE9E4`
- Shadow style: low contrast, large radius, shallow depth

## Layout Rules

- Desktop-first artboards for handoff, with responsive CSS already considered
- Left navigation for app pages
- One dominant action per screen
- Tables stay airy, with clear row separation and short labels
- Charts use minimal decoration and high data contrast

## Screen Inventory

- `index.html` — marketing / entry
- `overview.html` — executive dashboard
- `watchlist.html` — SKU tracking list
- `sku-detail.html` — trend + supplier comparison
- `alerts.html` — triage and action center
- `quote-builder.html` — quote package assembly
- `suppliers.html` — supplier performance workspace
- `settings.html` — rules, delivery channels, approvals

## Key Components

- Sidebar navigation
- Top search / status bar
- KPI cards
- Signal cards
- Trend chart panels
- Dense but breathable data tables
- Alert list with detail pane
- Builder summary panel
- Settings form rows with toggles
