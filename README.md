# The Camino Guide — Setup

## First-time setup (run once)

```bash
# 1. Install dependencies
npm install

# 2. Start the dev server
npm run dev
# → Site at http://localhost:4321
```

## Running the CMS locally

The CMS needs a separate process alongside the dev server:

```bash
# Terminal 1
npm run dev

# Terminal 2
npx decap-server
# → CMS at http://localhost:4321/admin
```

When running locally, the CMS uses your local files directly (no GitHub auth needed).

## Before deploying to Netlify

1. **Update `public/admin/config.yml`** — replace `YOUR-GITHUB-USERNAME/the-camino-guide` with your actual GitHub repo path.

2. **Enable Netlify Identity** in your Netlify dashboard (Site settings → Identity → Enable).

3. **Enable Git Gateway** (Site settings → Identity → Services → Git Gateway → Enable).

4. **Invite yourself** as a user via Netlify Identity.

5. Push to GitHub. Netlify auto-deploys from `main`.

## Project structure

```
src/
  content/
    config.ts          ← Content schema (edit field definitions here)
    routes/            ← One .md per route pillar (french-way.md, etc.)
    stages/            ← One .md per stage
    localities/        ← One .md per locality
  layouts/
    BaseLayout.astro   ← All pages use this
    StageLayout.astro  ← Stage pages (header + tabs + sidebar)
    LocalityLayout.astro ← Locality pages
  pages/
    index.astro        ← Homepage
    [route]/
      index.astro      ← Route pillar page (/french-way)
      [slug].astro     ← Stage page (/french-way/saint-jean-roncesvalles)
  styles/
    global.css         ← Full design system (colours, type, components)

public/
  admin/
    index.html         ← Decap CMS entry point
    config.yml         ← CMS field configuration
```

## URL structure

| Page type     | URL example                                    |
|---------------|------------------------------------------------|
| Homepage      | `/`                                            |
| Route pillar  | `/french-way`                                  |
| Stage guide   | `/french-way/saint-jean-roncesvalles`          |
| Locality      | `/french-way/roncesvalles`                     |

## Adding a new stage

**Via CMS:** Go to `/admin` → Stages → New Stage. Fill in all fields. Set Published = true when ready.

**Via file:** Create `src/content/stages/french-way-NN-slug.md` following the existing example.

## Content file naming convention

Stages:     `french-way-01-saint-jean-roncesvalles.md`
Localities: `french-way-roncesvalles.md`
Routes:     `french-way.md`

## Dependency notes

- Astro 4.x
- `@astrojs/sitemap` — auto-generates sitemap.xml on build
- `@astrojs/netlify` — optimises for Netlify static hosting

No framework (React/Vue/Svelte) — pure Astro components. Keeps the bundle minimal and mobile performance fast.

## Adding a second language later

The `i18n` config in `astro.config.mjs` is already set up for multiple locales.
To add Italian, add `'it'` to the `locales` array and create translated content
in `src/content/stages/it/` — Astro handles the routing automatically.
