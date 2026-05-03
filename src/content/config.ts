import { defineCollection, z } from 'astro:content';

// ─── ROUTES ───────────────────────────────────────────────────────────────────
// One pillar page per route. e.g. french-way, portuguese-way
const routes = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    subtitle: z.string().optional(),
    total_distance_km: z.number(),
    total_stages: z.number(),
    difficulty: z.enum(['moderate', 'hard', 'very-hard']),
    start_point: z.string().optional(),
    end_point: z.string().optional(),
    country: z.array(z.string()).optional(),
    coverImage: z.string().url().optional(),
    seo_description: z.string().max(160).optional(),
    published: z.boolean().default(false),
    last_verified: z.union([z.string(), z.date()]).optional(),
  }),
});

// ─── STAGES ───────────────────────────────────────────────────────────────────
// One page per traditional stage. Slug becomes the URL segment.
const stages = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),                        // "Saint-Jean-Pied-de-Port to Roncesvalles"
    route: z.string(),                        // "french-way" — matches routes slug
    order: z.number().int().positive(),       // 1, 2, 3...

    // Technical data (sidebar)
    distance_km: z.number(),
    distance_mi: z.number().optional(),
    elevation_gain_m: z.number().int(),
    elevation_loss_m: z.number().int(),
    max_slope_pct: z.string().optional(),
    avg_slope_pct: z.string().optional(),
    max_slope_pct_down: z.string().optional(),
    avg_slope_pct_down: z.string().optional(),
    difficulty: z.string(),
    estimated_time_h: z.string(),             // "6–8 hours"

    // Localities
    start_locality: z.string(),              // "Saint-Jean-Pied-de-Port"
    end_locality: z.string(),               // "Roncesvalles"
    start_locality_slug: z.string().optional(), // for internal linking
    end_locality_slug: z.string().optional(),

    // Navigation
    prev_stage_slug: z.string().nullable().optional(),
    next_stage_slug: z.string().nullable().optional(),

    // Section content — each maps to a tab or subsection
    // Body of the .md file = step_by_step (main narrative)
    // Other sections as frontmatter strings (short) or separate mdx later
    in_short: z.string(),                     // 2–3 sentences
    watch_out_for: z.array(z.string()),       // bullet items, each a sentence
    for_bikers: z.string().optional(),        // paragraph or two
    services_intro: z.string().optional(),    // intro paragraph for the Services tab
    // culture_pois lives in body content or separate field — premium later

    // Track type (Main vs Alternative route)
    track_type: z.enum(['Main', 'Alternative']).optional(),
    branch_from: z.number().optional(),       // stage number of parent, for alternatives

    // Map
    map_url: z.string().url().optional(),

    // Services (from Services database, grouped per stage at build time)
    services: z.array(z.object({
      name:        z.string(),
      type:        z.array(z.string()),
      km_marker:   z.number().optional(),
      location:    z.string().optional(),
      description: z.string().optional(),
      address:     z.string().optional(),
      phone:       z.string().optional(),
      website:     z.string().optional(),
      booking_url: z.string().optional(),
    })).optional(),

    // Meta
    coverImage: z.string().url().optional(),
    map_embed: z.string().optional(),
    seo_description: z.string().max(200).optional(),
    published: z.boolean().default(false),
    last_verified: z.union([z.string(), z.date()]).optional(),
  }),
});

// ─── LOCALITIES ───────────────────────────────────────────────────────────────
// One page per traditional stage endpoint (not every village).
const localities = defineCollection({
  type: 'content',
  schema: z.object({
    name: z.string(),                         // "Roncesvalles"
    name_alt: z.string().optional(),          // "Orreaga" (Basque / regional variant)
    route: z.string(),                        // "french-way"

    // Header data
    km_to_santiago: z.number(),
    population: z.number().int().optional(),
    languages: z.array(z.string()),           // ["Spanish", "Basque"]
    region: z.string().optional(),            // "Navarra"
    country: z.string().default('Spain'),

    // Practical services (lodging tab)
    has_albergue: z.boolean().default(false),
    has_hotel: z.boolean().default(false),
    has_atm: z.boolean().default(false),
    has_pharmacy: z.boolean().default(false),
    has_supermarket: z.boolean().default(false),
    has_medical: z.boolean().default(false),

    // Body of .md = the_guide narrative (Culture & history — premium later)
    // Lodging section is a separate structured field or second .md

    // Meta
    coverImage: z.string().url().optional(),
    seo_description: z.string().max(160).optional(),
    published: z.boolean().default(false),
    last_verified: z.union([z.string(), z.date()]).optional(),
  }),
});

export const collections = { routes, stages, localities };
