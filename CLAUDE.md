# CLAUDE.md — The Camino Guide

This file gives you everything you need to work on this project. Read it fully before doing anything.

---

## What this project is

**The Camino Guide** (`thecaminoguide.com`) is a content-focused website about the Camino de Santiago, targeting English-speaking pilgrims. It is owned by Viandotreks SL but editorially independent. The goal is to become the most complete and well-written English-language reference for the Camino.

The project is in active development. The French Way (Camino Francés) is the first route — approximately 33 stage pages, 30 locality pages, and 1 route pillar page.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Astro (fully static output) |
| Content source | Notion (via API) |
| Code repository | GitHub (`viandotreks/the-camino-guide`) |
| Hosting | Cloudflare Pages |
| Media storage | Cloudflare R2 |
| Deploy trigger | Notion formula link → Cloudflare deploy hook |
| Search | Pagefind (static index, built at deploy time) |

**No Netlify. No Decap CMS. No Netlify Identity.**

---

## Two content flows — keep them separate

### 1. Editorial content (routes, stages, localities, services)
Lives in Notion. Fetched at build time via Notion API. Never stored in the GitHub repo as files.

```
Notion (English databases) → build script → Astro → Cloudflare Pages
```

### 2. Site structure (homepage, listing pages, services page, search)
Lives in GitHub as `.astro` files. Edited in Claude sessions when needed.

```
Claude session → GitHub push → Cloudflare Pages rebuild
```

---

## Repository structure

```
the-camino-guide/
├── src/
│   ├── pages/
│   │   ├── index.astro              ← Homepage
│   │   ├── routes.astro             ← All routes listing
│   │   ├── localities.astro         ← All localities listing (grouped by route)
│   │   ├── services.astro           ← Viando services page (luggage transfer, trip planning)
│   │   ├── search.astro             ← Search results page (/search?q=)
│   │   └── [route]/
│   │       ├── index.astro          ← Route pillar page
│   │       └── [slug].astro         ← Stage or locality page (resolved at build time)
│   ├── layouts/
│   │   ├── BaseLayout.astro         ← Shell: nav, mobile drawer, search modal, footer
│   │   ├── StageLayout.astro        ← Stage page template
│   │   └── LocalityLayout.astro     ← Locality page template
│   ├── styles/
│   │   └── global.css               ← Design system, km-marker, mobile drawer, search UI
│   └── content/
│       └── generated/               ← Output of notion-build.ts — gitignored
├── scripts/
│   └── notion-build.ts              ← THE CRITICAL SCRIPT — see below
├── public/
├── astro.config.mjs
├── package.json
└── .env                             ← Never commit this
```

---

## Build scripts

```json
"scripts": {
  "prebuild": "tsx scripts/notion-build.ts",
  "build":    "astro build",
  "postbuild":"pagefind --site dist",
  "dev":      "astro dev"
}
```

Order: `notion-build.ts` → `astro build` → `pagefind --site dist`

The Pagefind index is generated into `dist/pagefind/` and served as static files. In dev mode, `/pagefind/pagefind.js` does not exist — search shows "only available on published site".

---

## The build script — `scripts/notion-build.ts`

This is the most important piece of code in the project. It runs before the Astro build.

### Notion API — critical detail
The Notion API requires a two-step process to query databases:
1. Call `databases.retrieve()` to get the internal `data_sources[0].id`
2. Use that ID in `dataSources.query()` — NOT the database ID from the env variable

This is handled by the `getDataSourceId()` function. A silent Notion client (no logger) is used for the probe to avoid spurious warnings in build output.

### Image pipeline (idempotent)
For every image block found in any page:
1. Generate a permanent R2 key using the Notion block ID: `notion-img/{blockId}.webp`
2. Check if this key already exists in R2 — if yes, skip, use existing R2 URL
3. If not in R2: download from Notion (URLs expire — must happen at build time), optimise to WebP, upload to R2
4. Replace the temporary Notion URL with the stable R2 URL

Cover images use `notion-cover/{pageId}.webp` as key (page ID, not block ID).

### Content processing rules
- Rich text inline code (backtick-wrapped) → `<span class="km-marker">text</span>`
- Stage ordering: main stages sorted by `Stage number`; alternatives (Track type = Alternative) interleaved after their parent stage identified by `Branch from`
- Services grouped by stage slug, sorted by `Km marker` ascending

---

## Notion database schemas

### Routes
```
Name          Title
Slug          Text        "french-way"
Status        Select      Draft | Ready | Published
Summary       Text        Intro paragraph
Total km      Number
Stages        Number      Count of stages
Difficulty    Select      ●●●●● | ●●●●○ | ●●●○○ | ●●○○○ | ●○○○○
Cover image   Files       Main route image
```

### Stages
```
Name            Title       "Saint-Jean-Pied-de-Port → Roncesvalles"
Slug            Text        "saint-jean-roncesvalles"
Route           Relation    → Routes
Stage number    Number      Sequential order
Status          Select      Draft | Ready | Published
Distance km     Number
Distance mi     Formula     prop("Distance km") * 0.621371
Elevation +     Number      Ascent in metres
Elevation -     Number      Descent in metres
Max grade       Number      Maximum uphill gradient %
Avg grade       Number      Average uphill gradient %
Max grade -     Number      Maximum downhill gradient %
Avg grade -     Number      Average downhill gradient %
Difficulty      Select      ●●●●● | ●●●●○ | ●●●○○ | ●●○○○ | ●○○○○
Estimated time  Text        "7–8 hours"
Start locality  Text        "Saint-Jean-Pied-de-Port"
End locality    Text        "Roncesvalles"
SEO description Text        Meta description copy
Map url         URL         Outdooractive external navigation link (opens in app/browser, not embedded)
Cartography     Files       Static route map infographic — uploaded to R2 at build time
Track type      Select      Main | Alternative
Branch from     Number      Stage number of parent stage (alternatives only)
In short        Text        Opening paragraph
Watch out       Text        Warnings and alerts
For bikers      Text        Cyclists-specific section
Services intro  Text        Intro paragraph for the Services tab
Step by step    Rich text   Main body — the walk description (page body)
```

Note: Stage pages do NOT have a Cover image. Cartography is a static infographic image (uploaded to R2). Map url is an external navigation link, not an embed.

### Localities
```
Name            Title       "Roncesvalles"
Slug            Text        "roncesvalles"
Route           Relation    → Routes
Km to Santiago  Number
Population      Number
Languages       Multi-select
Status          Select      Draft | Ready | Published
Cover image     Files       Main locality image
The guide       Rich text   Main body (page body)
```

### Services
```
Name          Title
Type          Multi-select  Accommodation | Restaurant | Café | Pilgrim reception | Shop
Stage         Relation      → Stages
Km marker     Number        Position along the stage in km
Location      Text          Place name label for the km group header
Description   Text
Address       Text
Phone         Text
Website       URL
Booking URL   URL           Affiliate link (Booking.com)
Status        Select        Draft | Published
```

### Site settings (singleton page)
Properties for homepage dynamic content. Also contains the publish button as a formula:
```
link("🚀 Publish site", "https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/904f1fef-db5c-4034-931c-3999d9fa53ac")
```
One click triggers a Cloudflare build. The site updates in 2–3 minutes.

---

## URL structure

```
/                                     Homepage
/routes                               All routes listing
/localities                           All localities listing (grouped by route)
/services                             Viando services page
/search?q=<query>                     Search results (Pagefind)
/french-way/                          Route pillar page
/french-way/saint-jean-roncesvalles   Stage page
/french-way/roncesvalles              Locality page
```

Slugs come from the `Slug` field in each Notion database. Must be lowercase, hyphenated, no special characters.

---

## Navigation

### Desktop nav (`site-nav`)
Horizontal bar: logo left · links (Routes / Localities / Services) · search icon + EN + Subscribe right.
Active link marked with `aria-current="page"` via `activeRoute` prop on `BaseLayout`.

### Mobile chrome (`site-chrome`)
Single line: logo left · breadcrumb + hamburger right.
Hamburger opens the **mobile drawer**.

### Mobile drawer (`mobile-menu`)
Slides in from the right. Contains:
1. Search input (form with `action="/search" name="q"`) — Enter navigates to search results
2. Nav links: Routes / Localities / Services
3. Footer: EN + Subscribe

Controlled via JS in `BaseLayout.astro`: `openMenu()` / `closeMenu()`. Closes on backdrop click or Escape key.

### Desktop search modal
Triggered by magnifier icon in `site-nav__right`. Floating modal centred below the nav. Input submits to `/search?q=`.

---

## Search (Pagefind)

Pagefind generates a static full-text index at build time (`postbuild` step). The index is served from `/pagefind/`.

### What is indexed
Only editorial prose — `data-pagefind-ignore` is applied to all UI chrome:
- `BaseLayout`: header (`site-chrome`), nav (`site-nav`), footer, mobile drawer, search modal
- `StageLayout`: page header, map area, tab bar, sidebar, data panel, services tab, culture tab, seq-nav
- `LocalityLayout`: page header, map area, tab bar, lodging tab
- `[route]/index.astro`: route header, stage list

What IS indexed: the `<slot />` content (Step by Step narrative, In Short, Watch Out for) and locality guide prose.

### Page type meta
Each layout adds a hidden span for the type badge in search results:
```html
<span data-pagefind-meta="type:Stage" hidden></span>
<span data-pagefind-meta="type:Locality" hidden></span>
<span data-pagefind-meta="type:Route" hidden></span>
```

### Dynamic import pattern
Pagefind is loaded lazily to avoid Vite static analysis errors in dev:
```js
const dynamicImport = new Function('p', 'return import(p)');
const pf = await dynamicImport('/pagefind/pagefind.js');
```
Do NOT use `import('/pagefind/pagefind.js')` directly — Vite will try to resolve it at build time and fail.

### Search results page (`/search`)
- Reads `?q=` from URL on load and runs search immediately
- Results: card per result, badge (Stage / Locality / Route) + title only — no excerpt
- Result styles are in `global.css` (not scoped) because they're injected via `innerHTML`

---

## Design system

**Fonts**: Source Serif 4 (headings, serif) + Inter (body, sans-serif)
**Palette**:
- `#e77067` — brand accent (terracotta/coral) — used for CTAs, badges, icons, links
- Forest green — secondary (nav active states, focus rings)
**Approach**: Mobile-first. Minimal JavaScript (only nav drawer + search).

### Tab navigation (stage/locality pages)
- Tab 1: The Guide (always free)
- Tab 2: Services (accommodation and services along the route — always free)
- Tab 3: Culture & POIs (future premium content — shows "Soon")

### Technical data sidebar (stage pages)
Shows: distance in km AND mi · elevation gain/loss · max grade uphill/downhill · avg grade uphill/downhill · walking time · difficulty (circles, not text label)

### Difficulty display
Render the value directly from Notion — do not map to text labels. Values are: `●●●●●` `●●●●○` `●●●○○` `●●○○○` `●○○○○`

### km-marker class
Inline code in Notion rich text renders as `<span class="km-marker">`. CSS in `global.css`:
```css
.km-marker {
  background: #000;
  color: oklch(97.2% .008 80);
  font-family: var(--mono);
  font-size: 0.85em;
  padding: 2px 5px;
  border-radius: 4px;
  margin-left: 2px;
  margin-right: 2px;
  white-space: nowrap;
}
```

---

## Environment variables

Never hardcode these. Live in `.env` locally and in Cloudflare Pages environment variables in production.

```
NOTION_API_KEY
NOTION_ROUTES_DB
NOTION_STAGES_DB
NOTION_LOCALITIES_DB
NOTION_SERVICES_DB
NOTION_SETTINGS_PAGE
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME          camino-guide-media
R2_PUBLIC_URL           https://pub-2af617e07c91472a9d722f9b2a8b4264.r2.dev
```

---

## Voice and tone

- Speaks directly to "you" — not "the pilgrim", not "one"
- Uses contractions freely
- Makes clear judgements: "this is the safer option", "don't attempt this in fog"
- Dry wit, direct authority, earned reflections — never hollow enthusiasm
- American English: "meter", "color", "organize"
- Avoids: passive constructions, academic hedging, "truly amazing", "must-see", translated rhetoric

The voice reference document (`camino-guide-voice-reference.md`) is the definitive guide. Read it when writing any content.

---

## What the owner does vs what Claude does

**Oscar (project owner)**:
- Produces content in Spanish in Notion (separate working workspace)
- Writes final English content directly into Notion publication databases
- Makes editorial and strategic decisions
- Handles manual configuration steps in dashboards
- Publishes by clicking the deploy formula link in Site Settings

**Claude**:
- All code — templates, components, build scripts, configuration
- Translation from Spanish to English (native register, not literal)
- Technical implementation decisions within the defined architecture
- Creating and updating Notion databases when schema changes are needed
- Never changes the architecture without raising it first

**Do not**:
- Suggest moving away from this stack without a strong reason and explicit discussion
- Add dependencies without checking if they're necessary
- Store content in the GitHub repo — content lives in Notion
- Commit `.env` or any credentials

---

## Current state (May 2026)

- ✅ Cloudflare Pages connected to GitHub, automatic deploys active
- ✅ Cloudflare R2 bucket (`camino-guide-media`) created, public access enabled
- ✅ Notion databases created and connected: Routes, Stages, Localities, Services, Site Settings
- ✅ `notion-build.ts` script working end-to-end in production
- ✅ Deploy hook configured — formula link in Notion Site Settings
- ✅ Stage 1 (Saint-Jean → Roncesvalles) content live, Services tab rendering
- ✅ Services database: icon key, intro text, grouped by km marker with location label
- ✅ Navigation: mobile drawer + desktop search modal, nav links = Routes / Localities / Services
- ✅ Search: Pagefind integration, `/search?q=` results page with type badges
- ✅ Listing pages: `/routes`, `/localities`, `/services`
- ⏳ Domain `thecaminoguide.com` still at Dinahosting — migrate to Cloudflare when content is ready to launch
