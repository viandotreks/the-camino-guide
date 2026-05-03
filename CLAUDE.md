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

**No Netlify. No Decap CMS. No Netlify Identity.**

---

## Two content flows — keep them separate

### 1. Editorial content (routes, stages, localities, services)
Lives in Notion. Fetched at build time via Notion API. Never stored in the GitHub repo as files.

```
Notion (English databases) → build script → Astro → Cloudflare Pages
```

### 2. Site structure (homepage, About, Services page, legal pages)
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
│   │   ├── index.astro              ← Homepage (reads from Notion Site settings singleton)
│   │   ├── about.astro
│   │   ├── services.astro           ← Viando baggage service integration
│   │   ├── preparation/
│   │   │   └── index.astro          ← Gear, packing, training (Amazon affiliate content)
│   │   ├── [route]/
│   │   │   ├── index.astro          ← Route pillar page
│   │   │   ├── [stage].astro        ← Stage page template
│   │   │   └── [locality].astro     ← Locality page template
│   │   └── legal/
│   │       ├── privacy.astro
│   │       └── terms.astro
│   ├── components/
│   │   ├── Header.astro
│   │   ├── Footer.astro
│   │   ├── TabNav.astro             ← The Guide / Services / Culture & POIs tabs
│   │   ├── TechnicalData.astro      ← Sidebar: distance km+mi, elevation, grade, difficulty
│   │   ├── StageCard.astro          ← Used in route pillar page
│   │   └── LocalityCard.astro
│   ├── layouts/
│   │   ├── BaseLayout.astro
│   │   ├── StageLayout.astro
│   │   └── LocalityLayout.astro
│   └── styles/
│       └── global.css               ← Includes .km-marker class
├── scripts/
│   └── notion-build.ts              ← THE CRITICAL SCRIPT — see below
├── public/
├── astro.config.mjs
├── package.json
└── .env                             ← Never commit this
```

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

### Prebuild step
```json
"scripts": {
  "prebuild": "tsx scripts/notion-build.ts",
  "build": "astro build",
  "dev": "astro dev"
}
```

Generated files go to `src/content/generated/` — this directory is gitignored.

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
Map url         URL         Outdooractive embed link
Track type      Select      Main | Alternative
Branch from     Number      Stage number of parent stage (alternatives only)
In short        Text        Opening paragraph
Watch out       Text        Warnings and alerts
For bikers      Text        Cyclists-specific section
Services intro  Text        Intro paragraph for the Services tab
Step by step    Rich text   Main body — the walk description (page body)
```

Note: Stage pages do NOT have a Cover image. The map is embedded via `Map url` (Outdooractive).

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
/french-way/                          Route pillar page
/french-way/saint-jean-roncesvalles   Stage page
/french-way/roncesvalles              Locality page
/about/
/services/
/preparation/
/legal/privacy/
/legal/terms/
```

Slugs come from the `Slug` field in each Notion database. Must be lowercase, hyphenated, no special characters.

---

## Astro content collection schemas

### Route
```typescript
const routesCollection = defineCollection({
  schema: z.object({
    name: z.string(),
    slug: z.string(),
    summary: z.string(),
    totalKm: z.number(),
    stages: z.number(),
    difficulty: z.string(),
    coverImage: z.string().url().optional(),
  })
});
```

### Stage
```typescript
const stagesCollection = defineCollection({
  schema: z.object({
    name: z.string(),
    slug: z.string(),
    route: z.string(),
    stageNumber: z.number(),
    distanceKm: z.number(),
    distanceMi: z.number().optional(),
    elevationUp: z.number(),
    elevationDown: z.number(),
    maxGrade: z.number().optional(),
    avgGrade: z.number().optional(),
    maxGradeDown: z.number().optional(),
    avgGradeDown: z.number().optional(),
    difficulty: z.string(),
    estimatedTime: z.string().optional(),
    startLocality: z.string().optional(),
    endLocality: z.string().optional(),
    seoDescription: z.string().optional(),
    mapUrl: z.string().url().optional(),
    trackType: z.enum(['Main', 'Alternative']).optional(),
    branchFrom: z.number().optional(),
    inShort: z.string(),
    watchOut: z.string().optional(),
    forBikers: z.string().optional(),
    servicesIntro: z.string().optional(),
    services: z.array(z.object({
      name: z.string(),
      type: z.array(z.string()),
      kmMarker: z.number().optional(),
      location: z.string().optional(),
      description: z.string().optional(),
      address: z.string().optional(),
      phone: z.string().optional(),
      website: z.string().optional(),
      bookingUrl: z.string().optional(),
    })).optional(),
    // stepByStep is the markdown body
  })
});
```

### Locality
```typescript
const localitiesCollection = defineCollection({
  schema: z.object({
    name: z.string(),
    slug: z.string(),
    route: z.string(),
    kmToSantiago: z.number(),
    population: z.number().optional(),
    languages: z.array(z.string()).optional(),
    coverImage: z.string().url().optional(),
    // theGuide is the markdown body
  })
});
```

---

## Design system

**Fonts**: Lora (headings, serif) + Source Sans 3 (body, sans-serif)
**Palette**: Forest green (primary) + Amber (accent)
**Approach**: Mobile-first. No unnecessary JavaScript.

### Tab navigation
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
- ⏳ Domain `thecaminoguide.com` still at Dinahosting — migrate to Cloudflare when content is ready to launch
