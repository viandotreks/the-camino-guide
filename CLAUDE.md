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
| Deploy trigger | Notion button → Make.com → Cloudflare deploy hook |

**No Netlify. No Decap CMS. No Netlify Identity.**

---

## Two content flows — keep them separate

### 1. Editorial content (routes, stages, localities)
Lives in Notion. Fetched at build time via Notion API. Never stored in the GitHub repo as files.

```
Notion (English databases) → build script → Astro → Cloudflare Pages
```

### 2. Site structure (homepage, About, Services, legal pages)
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
│   │   ├── TechnicalData.astro      ← Sidebar: distance, elevation, grade, difficulty
│   │   ├── StageCard.astro          ← Used in route pillar page
│   │   └── LocalityCard.astro
│   ├── layouts/
│   │   ├── BaseLayout.astro
│   │   ├── StageLayout.astro
│   │   └── LocalityLayout.astro
│   └── styles/
│       └── global.css
├── scripts/
│   └── notion-build.ts              ← THE CRITICAL SCRIPT — see below
├── public/
├── astro.config.mjs
├── package.json
└── .env                             ← Never commit this
```

---

## The build script — `scripts/notion-build.ts`

This is the most important piece of code in the project. It runs before the Astro build and does four things:

### 1. Fetch from Notion
Queries the three Notion databases (Routes, Stages, Localities) filtering for `Status = Published` only. Also fetches the Site settings singleton page.

### 2. Image pipeline (idempotent)
For every image block found in any page:
1. Generate a permanent R2 key using the Notion block ID: `notion-img/{blockId}.webp`
2. Check if this key already exists in R2 — if yes, skip upload, use the existing R2 URL
3. If not in R2: download from Notion (URLs expire — must happen at build time), optimise (convert to WebP, resize), upload to R2
4. Replace the temporary Notion URL with the stable R2 URL in the content

**Critical**: use Notion block ID as the R2 key. This makes the pipeline idempotent — the same image always maps to the same R2 key across builds. No duplicates.

Cover images from the database `Files` property follow the same logic but use `notion-cover/{blockId}.webp` as the key prefix.

### 3. Generate content files
Convert the processed Notion content into markdown files with frontmatter that match the Astro content collection schemas. Write these to a temporary directory (e.g., `src/content/generated/`) that is gitignored.

### 4. The script runs as a prebuild step
In `package.json`:
```json
"scripts": {
  "prebuild": "tsx scripts/notion-build.ts",
  "build": "astro build",
  "dev": "astro dev"
}
```

---

## Notion database schemas

### Routes
```
Name          Text        "French Way"
Slug          Text        "french-way"
Status        Select      Draft | Ready | Published
Summary       Text        Intro paragraph
Total km      Number
Stages        Number      Count of stages
Difficulty    Select      Moderate | Demanding | Strenuous
Cover image   Files       Main route image
```

### Stages
```
Name          Text        "Saint-Jean-Pied-de-Port → Roncesvalles"
Slug          Text        "saint-jean-roncesvalles"
Route         Relation    → Routes
Stage number  Number      Sequential order
Status        Select      Draft | Ready | Published
Distance km   Number
Elevation +   Number      Ascent in metres
Elevation -   Number      Descent in metres
Max grade     Number      Maximum gradient %
Avg grade     Number      Average gradient %
Difficulty    Select      Moderate | Demanding | Strenuous
In short      Text        Opening paragraph
Watch out     Text        Warnings and alerts
Step by step  Text (rich) Main body — the walk description
For bikers    Text        Cyclists-specific section
Cover image   Files       Main stage image
```

### Localities
```
Name          Text        "Roncesvalles"
Slug          Text        "roncesvalles"
Route         Relation    → Routes
Km to Santiago Number
Population    Number
Languages     Multi-select
Status        Select      Draft | Ready | Published
The guide     Text (rich) Main body
Cover image   Files       Main locality image
```

### Site settings (singleton page, not a database)
A single Notion page with properties for homepage dynamic content: featured route, seasonal notice, intro text. Read at build time and injected into the homepage template.

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

Slugs come from the `Slug` field in each Notion database. They must be lowercase, hyphenated, no special characters. This is the author's responsibility.

---

## Astro content collection schemas

The generated markdown files must match these schemas exactly.

### Route
```typescript
// src/content/config.ts
const routesCollection = defineCollection({
  schema: z.object({
    name: z.string(),
    slug: z.string(),
    summary: z.string(),
    totalKm: z.number(),
    stages: z.number(),
    difficulty: z.enum(['Moderate', 'Demanding', 'Strenuous']),
    coverImage: z.string().url(), // R2 URL
  })
});
```

### Stage
```typescript
const stagesCollection = defineCollection({
  schema: z.object({
    name: z.string(),
    slug: z.string(),
    route: z.string(),        // route slug
    stageNumber: z.number(),
    distanceKm: z.number(),
    elevationUp: z.number(),
    elevationDown: z.number(),
    maxGrade: z.number(),
    avgGrade: z.number(),
    difficulty: z.enum(['Moderate', 'Demanding', 'Strenuous']),
    inShort: z.string(),
    watchOut: z.string(),
    forBikers: z.string(),
    coverImage: z.string().url(), // R2 URL
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
    route: z.string(),        // route slug
    kmToSantiago: z.number(),
    population: z.number(),
    languages: z.array(z.string()),
    coverImage: z.string().url(), // R2 URL
    // theGuide is the markdown body
  })
});
```

---

## Environment variables

Never hardcode these. They live in `.env` locally and in Cloudflare Pages environment variables in production.

```
NOTION_API_KEY
NOTION_ROUTES_DB
NOTION_STAGES_DB
NOTION_LOCALITIES_DB
NOTION_SETTINGS_PAGE
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME
R2_PUBLIC_URL          (e.g. https://media.thecaminoguide.com)
```

---

## Design system

**Fonts**: Lora (headings, serif) + Source Sans 3 (body, sans-serif)
**Palette**: Forest green (primary) + Amber (accent)
**Approach**: Mobile-first. Page speed is a ranking factor and a product requirement. No unnecessary JavaScript. Astro's zero-JS-by-default approach is the right call.

Stage and locality pages have a **tab navigation**:
- Tab 1: The Guide (always free)
- Tab 2: Services (accommodation, ATMs along the route — always free)
- Tab 3: Culture & POIs (future premium content)

The technical data sidebar (distance, elevation, grade, difficulty) appears on all stage pages. It must be fast-loading and readable on mobile at a glance.

---

## Voice and tone

The site has a defined editorial voice. When writing or editing any copy:

- Speaks directly to "you" — not "the pilgrim", not "one"
- Uses contractions freely
- Makes clear judgements: "this is the safer option", "don't attempt this in fog"
- Dry wit, direct authority, earned reflections — never hollow enthusiasm
- American English: "meter", "color", "organize"
- Avoids: passive constructions, academic hedging, "truly amazing", "must-see", translated rhetoric

The voice reference document (`camino-guide-voice-reference.md`) in the project files is the definitive guide. Read it when writing any content.

---

## What the owner does vs what Claude does

**Oscar (project owner)**:
- Produces content in Spanish in Notion
- Makes editorial and strategic decisions
- Handles all manual configuration steps (Cloudflare dashboard, Notion setup, Make.com)
- Reviews and approves before publishing

**Claude**:
- All code — templates, components, build scripts, configuration
- Translation from Spanish to English (native register, not literal)
- Technical implementation decisions within the defined architecture
- Never changes the architecture without raising it first

**Do not**:
- Suggest moving away from this stack without a strong reason and explicit discussion
- Add dependencies without checking if they're necessary
- Store content in the GitHub repo — content lives in Notion
- Commit `.env` or any credentials

---

## Current state (May 2026)

The project is migrating from a previous setup (Netlify + Decap CMS) to the architecture described here. The GitHub repo contains an earlier implementation. The migration sequence is:

1. Connect GitHub repo to Cloudflare Pages, verify basic Astro build works ✓ (pending)
2. Create Cloudflare R2 bucket and configure public domain (pending)
3. Create Notion publication databases with correct schema (pending)
4. Write and test `notion-build.ts` script (pending)
5. Configure deploy hook and Make.com trigger (pending)
6. Migrate existing content (Stage 1, French Way) to Notion databases (pending)
7. Verify full pipeline end-to-end (pending)

Start at step 1 unless told otherwise.
