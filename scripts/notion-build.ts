import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '..', '.env') });
import { Client } from '@notionhq/client';
import { NotionToMarkdown } from 'notion-to-md';
import { S3Client, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

// ─── ENV ─────────────────────────────────────────────────────────────────────

const {
  NOTION_API_KEY,
  NOTION_ROUTES_DB,
  NOTION_STAGES_DB,
  NOTION_LOCALITIES_DB,
  NOTION_SERVICES_DB,
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME,
  R2_PUBLIC_URL,
} = process.env;

const missing = [
  'NOTION_API_KEY', 'NOTION_ROUTES_DB', 'NOTION_STAGES_DB', 'NOTION_LOCALITIES_DB',
  'NOTION_SERVICES_DB',
  'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME', 'R2_PUBLIC_URL',
].filter(k => !process.env[k]);

if (missing.length) {
  console.error(`notion-build: missing env vars: ${missing.join(', ')}`);
  process.exit(1);
}

// ─── CLIENTS ─────────────────────────────────────────────────────────────────

const notion = new Client({ auth: NOTION_API_KEY });
// Silent client used only to probe whether an ID is a database page ID (see getDataSourceId)
const silentNotion = new Client({ auth: NOTION_API_KEY!, logger: () => {} });

const n2m = new NotionToMarkdown({ notionClient: notion });

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID!,
    secretAccessKey: R2_SECRET_ACCESS_KEY!,
  },
});

// ─── OUTPUT PATHS ────────────────────────────────────────────────────────────

const OUT = {
  routes:     'src/content/routes',
  stages:     'src/content/stages',
  localities: 'src/content/localities',
};

// ─── STATS ───────────────────────────────────────────────────────────────────

let imagesUploaded = 0;
let imagesSkipped  = 0;

// ─── IMAGE PIPELINE ──────────────────────────────────────────────────────────

async function processImage(notionUrl: string, r2Key: string): Promise<string> {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME!, Key: r2Key }));
    imagesSkipped++;
    return `${R2_PUBLIC_URL}/${r2Key}`;
  } catch {
    // Not in R2 yet — download, convert, upload
  }

  let buffer: Buffer;
  try {
    const res = await fetch(notionUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    buffer = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    console.warn(`  [img] download failed for ${r2Key}: ${err}`);
    return notionUrl; // fallback to original (will break on next build if URL expires)
  }

  const webp = await sharp(buffer).webp({ quality: 85 }).toBuffer();

  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME!,
    Key: r2Key,
    Body: webp,
    ContentType: 'image/webp',
  }));

  imagesUploaded++;
  return `${R2_PUBLIC_URL}/${r2Key}`;
}

// ─── NOTION HELPERS ──────────────────────────────────────────────────────────

function text(page: any, name: string): string {
  const p = page.properties[name];
  if (!p) return '';
  if (p.type === 'title')     return p.title.map((t: any)     => t.plain_text).join('');
  if (p.type === 'rich_text') return p.rich_text.map((t: any) => t.plain_text).join('');
  return '';
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Convert a Notion rich_text array to an HTML string, preserving inline annotations.
// With paragraphs: true, splits on \n to wrap each segment in <p>.
function richTextToHtml(richText: any[], paragraphs = false): string {
  const inline = richText.map(item => {
    let t = escapeHtml(item.plain_text);
    const a = item.annotations;
    if (a.code)          t = `<code>${t}</code>`;
    if (a.bold)          t = `<strong>${t}</strong>`;
    if (a.italic)        t = `<em>${t}</em>`;
    if (a.strikethrough) t = `<s>${t}</s>`;
    if (a.underline)     t = `<u>${t}</u>`;
    return t;
  }).join('');

  if (!paragraphs) return inline;
  return inline.split(/\n+/).filter(s => s.trim()).map(p => `<p>${p}</p>`).join('');
}

function html(page: any, name: string, paragraphs = false): string {
  const p = page.properties[name];
  if (!p) return '';
  if (p.type === 'rich_text') return richTextToHtml(p.rich_text, paragraphs);
  if (p.type === 'title')     return richTextToHtml(p.title, paragraphs);
  return '';
}

// Split a rich_text array on \n boundaries, returning one HTML string per line.
// Handles annotations that span across a newline correctly.
function richTextToLines(richText: any[]): string[] {
  const lines: string[] = [''];
  for (const item of richText) {
    const parts = item.plain_text.split('\n');
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) lines.push('');
      if (!parts[i]) continue;
      let t = escapeHtml(parts[i]);
      const a = item.annotations;
      if (a.code)          t = `<code>${t}</code>`;
      if (a.bold)          t = `<strong>${t}</strong>`;
      if (a.italic)        t = `<em>${t}</em>`;
      if (a.strikethrough) t = `<s>${t}</s>`;
      if (a.underline)     t = `<u>${t}</u>`;
      lines[lines.length - 1] += t;
    }
  }
  return lines.filter(l => l.trim());
}

function num(page: any, name: string): number {
  const p = page.properties[name];
  if (!p) return 0;
  if (p.type === 'number')  return p.number  ?? 0;
  if (p.type === 'formula') return p.formula?.number ?? 0;
  return 0;
}

function select(page: any, name: string): string {
  return page.properties[name]?.select?.name ?? '';
}

function multiSelect(page: any, name: string): string[] {
  return page.properties[name]?.multi_select?.map((s: any) => s.name) ?? [];
}

function relationIds(page: any, name: string): string[] {
  return page.properties[name]?.relation?.map((r: any) => r.id) ?? [];
}

function mapDifficulty(value: string): string {
  const map: Record<string, string> = {
    '●●●●● (hardest)': 'very-hard',
    '●●●●○ (hard)':    'hard',
    '●●●○○ (medium)':  'moderate',
    '●●○○○ (easy)':    'easy',
    '●○○○○ (easiest)': 'easiest',
    // legacy values — kept for routes database which hasn't changed yet
    Moderate:  'moderate',
    Demanding: 'hard',
    Strenuous: 'very-hard',
  };
  return map[value] ?? 'moderate';
}

async function getCoverImage(page: any): Promise<string | null> {
  const files = page.properties['Cover image']?.files;
  if (!files?.length) return null;
  const file = files[0];
  const url  = file.type === 'external' ? file.external.url : file.file?.url;
  if (!url) return null;
  return processImage(url, `notion-cover/${page.id}.webp`);
}

// Cache database_id → data_source_id to avoid redundant retrieve calls
const dataSourceIdCache = new Map<string, string>();

async function getDataSourceId(databaseId: string): Promise<string> {
  if (dataSourceIdCache.has(databaseId)) return dataSourceIdCache.get(databaseId)!;
  try {
    const db = await silentNotion.databases.retrieve({ database_id: databaseId }) as any;
    const dsId: string = db.data_sources?.[0]?.id ?? databaseId;
    dataSourceIdCache.set(databaseId, dsId);
    return dsId;
  } catch {
    // databases.retrieve failed — assume the provided ID is already a data source ID
    dataSourceIdCache.set(databaseId, databaseId);
    return databaseId;
  }
}

async function queryAll(databaseId: string): Promise<any[]> {
  const dataSourceId = await getDataSourceId(databaseId);
  const pages: any[] = [];
  let cursor: string | undefined;
  do {
    const res = await notion.dataSources.query({
      data_source_id: dataSourceId,
      filter: { property: 'Status', select: { equals: 'Published' } },
      start_cursor: cursor,
    });
    pages.push(...res.results);
    cursor = res.has_more ? res.next_cursor ?? undefined : undefined;
  } while (cursor);
  return pages;
}

// ─── RICH TEXT → MARKDOWN ────────────────────────────────────────────────────

// Register image block transformer once — processes inline images through R2 pipeline
n2m.setCustomTransformer('image', async (block: any) => {
  const img = block.image;
  const url  = img.type === 'external' ? img.external.url : img.file?.url;
  if (!url) return '';
  const r2Url  = await processImage(url, `notion-img/${block.id}.webp`);
  const caption = img.caption?.map((c: any) => c.plain_text).join('') ?? '';
  return `![${caption}](${r2Url})`;
});

async function toMarkdown(pageId: string): Promise<string> {
  const blocks = await n2m.pageToMarkdown(pageId);
  const { parent } = n2m.toMarkdownString(blocks);
  // Inline code in this content always represents km markers
  return (parent ?? '').replace(/`([^`\n]+)`/g, '<span class="km-marker">$1</span>');
}

// ─── FRONTMATTER ─────────────────────────────────────────────────────────────

function fm(data: Record<string, any>): string {
  const lines = ['---'];
  for (const [key, val] of Object.entries(data)) {
    if (val === null || val === undefined) continue;
    if (Array.isArray(val)) {
      lines.push(`${key}:`);
      val.forEach(v => lines.push(`  - ${JSON.stringify(v)}`));
    } else if (typeof val === 'string' && val.includes('\n')) {
      lines.push(`${key}: |`);
      val.split('\n').forEach(line => lines.push(`  ${line}`));
    } else {
      lines.push(`${key}: ${JSON.stringify(val)}`);
    }
  }
  lines.push('---');
  return lines.join('\n');
}

function clearDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.readdirSync(dir)
      .filter(f => f.endsWith('.md'))
      .forEach(f => fs.unlinkSync(path.join(dir, f)));
  }
  fs.mkdirSync(dir, { recursive: true });
}

// ─── ROUTES ──────────────────────────────────────────────────────────────────

async function buildRoutes(): Promise<Map<string, string>> {
  const pages = await queryAll(NOTION_ROUTES_DB!);
  clearDir(OUT.routes);
  const idToSlug = new Map<string, string>();

  for (const page of pages) {
    const slug = text(page, 'Slug');
    if (!slug) { console.warn(`  [route] no slug on ${page.id}, skipping`); continue; }
    idToSlug.set(page.id, slug);

    const coverImage = await getCoverImage(page);
    const body       = await toMarkdown(page.id);

    const frontmatter = fm({
      title:            text(page, 'Name'),
      subtitle:         text(page, 'Summary') || undefined,
      total_distance_km: num(page, 'Total km'),
      total_stages:     num(page, 'Stages'),
      difficulty:       mapDifficulty(select(page, 'Difficulty')),
      country:          ['France', 'Spain'],
      coverImage:       coverImage ?? undefined,
      published:        true,
    });

    fs.writeFileSync(path.join(OUT.routes, `${slug}.md`), `${frontmatter}\n\n${body}`);
    console.log(`  route: ${slug}`);
  }

  return idToSlug;
}

// ─── SERVICES ────────────────────────────────────────────────────────────────

interface ServiceItem {
  name:        string;
  type:        string[];
  km_marker?:  number;
  location?:   string;
  description?: string;
  address?:    string;
  phone?:      string;
  website?:    string;
  booking_url?: string;
}

async function fetchServices(stageIdToSlug: Map<string, string>): Promise<Map<string, ServiceItem[]>> {
  const pages    = await queryAll(NOTION_SERVICES_DB!);
  const byStage  = new Map<string, ServiceItem[]>();

  for (const page of pages) {
    const stageIds = relationIds(page, 'Stage');
    if (!stageIds.length) continue;
    const stageSlug = stageIdToSlug.get(stageIds[0]);
    if (!stageSlug) continue;

    // Preserve null km_marker for sort (num() returns 0 for null, which is wrong here)
    const kmRaw = page.properties['Km marker']?.number ?? null;

    const service: ServiceItem = {
      name:        text(page, 'Name'),
      type:        multiSelect(page, 'Type'),
      km_marker:   kmRaw !== null ? kmRaw : undefined,
      location:    text(page, 'Location') || undefined,
      description: text(page, 'Description') || undefined,
      address:     text(page, 'Address')     || undefined,
      phone:       text(page, 'Phone')       || undefined,
      website:     page.properties['Website']?.url     || undefined,
      booking_url: page.properties['Booking URL']?.url || undefined,
    };

    if (!byStage.has(stageSlug)) byStage.set(stageSlug, []);
    byStage.get(stageSlug)!.push(service);
  }

  // Sort within each stage: by km_marker asc, missing km_marker goes to end
  for (const [slug, services] of byStage) {
    byStage.set(slug, services.sort((a, b) => {
      if (a.km_marker == null && b.km_marker == null) return 0;
      if (a.km_marker == null) return 1;
      if (b.km_marker == null) return -1;
      return a.km_marker - b.km_marker;
    }));
    console.log(`  services for ${slug}: ${services.length}`);
  }

  return byStage;
}

// ─── STAGES ──────────────────────────────────────────────────────────────────

function orderStages(pages: any[]): any[] {
  const mains = pages
    .filter(p => select(p, 'Track type') !== 'Alternative')
    .sort((a, b) => num(a, 'Stage number') - num(b, 'Stage number'));

  const alternatives = pages
    .filter(p => select(p, 'Track type') === 'Alternative')
    .sort((a, b) => num(a, 'Stage number') - num(b, 'Stage number'));

  // Build a map from parent stage number → alternative pages
  const altsByParent = new Map<number, any[]>();
  for (const alt of alternatives) {
    const parent = num(alt, 'Branch from');
    if (!altsByParent.has(parent)) altsByParent.set(parent, []);
    altsByParent.get(parent)!.push(alt);
  }

  // Interleave: each main stage is followed by its alternatives
  const ordered: any[] = [];
  for (const main of mains) {
    ordered.push(main);
    const children = altsByParent.get(num(main, 'Stage number')) ?? [];
    ordered.push(...children);
  }

  return ordered;
}

async function buildStages(routeSlugMap: Map<string, string>): Promise<void> {
  const pages = await queryAll(NOTION_STAGES_DB!);

  // Build page-id → slug map before fetching services (services need to resolve stage slugs)
  const stageIdToSlug = new Map<string, string>();
  for (const page of pages) {
    const slug = text(page, 'Slug');
    if (slug) stageIdToSlug.set(page.id, slug);
  }

  const servicesByStage = await fetchServices(stageIdToSlug);

  const sorted = orderStages(pages);
  const slugs  = sorted.map(p => text(p, 'Slug'));
  clearDir(OUT.stages);

  for (let i = 0; i < sorted.length; i++) {
    const page = sorted[i];
    const slug = slugs[i];
    if (!slug) { console.warn(`  [stage] no slug on ${page.id}, skipping`); continue; }

    const routeIds  = relationIds(page, 'Route');
    const routeSlug = routeIds.length ? (routeSlugMap.get(routeIds[0]) ?? '') : '';

    const coverImage = await getCoverImage(page);
    const body       = await toMarkdown(page.id);

    // watch_out_for: split rich_text on newlines, preserving inline formatting per line
    const watch_out_for = richTextToLines(page.properties['Watch out']?.rich_text ?? []);

    // Grade fields: numbers in Notion, strings in schema (appended with % in template)
    const maxUp   = num(page, 'Max grade');
    const avgUp   = num(page, 'Avg grade');
    const maxDown = num(page, 'Max grade -');
    const avgDown = num(page, 'Avg grade -');

    const trackType  = select(page, 'Track type') || undefined;
    const branchFrom = num(page, 'Branch from') || undefined;
    const mapUrl     = text(page, 'Map url') || undefined;
    const distMi     = num(page, 'Distance mi') || undefined;

    const frontmatter = fm({
      title:              text(page, 'Name'),
      route:              routeSlug,
      order:              num(page, 'Stage number'),
      distance_km:        num(page, 'Distance km'),
      distance_mi:        distMi,
      elevation_gain_m:   num(page, 'Elevation +'),
      elevation_loss_m:   num(page, 'Elevation -'),
      max_slope_pct:      maxUp   ? String(maxUp)   : undefined,
      avg_slope_pct:      avgUp   ? String(avgUp)   : undefined,
      max_slope_pct_down: maxDown ? String(maxDown) : undefined,
      avg_slope_pct_down: avgDown ? String(avgDown) : undefined,
      difficulty:         select(page, 'Difficulty'),
      estimated_time_h:   text(page, 'Estimated time') || undefined,
      start_locality:     text(page, 'Start locality') || undefined,
      end_locality:       text(page, 'End locality') || undefined,
      track_type:         trackType,
      branch_from:        branchFrom,
      map_url:            mapUrl,
      prev_stage_slug:    slugs[i - 1] ?? null,
      next_stage_slug:    slugs[i + 1] ?? null,
      in_short:           html(page, 'In short', true),
      watch_out_for,
      for_bikers:         html(page, 'For bikers', true) || undefined,
      services_intro:     html(page, 'Services intro', true) || undefined,
      services:           servicesByStage.get(slug) ?? undefined,
      seo_description:    text(page, 'SEO description') || undefined,
      coverImage:         coverImage ?? undefined,
      published:          true,
    });

    fs.writeFileSync(path.join(OUT.stages, `${slug}.md`), `${frontmatter}\n\n${body}`);
    const trackLabel = trackType === 'Alternative' ? ` [alt, branch from ${branchFrom}]` : '';
    console.log(`  stage ${num(page, 'Stage number')}: ${slug}${trackLabel}`);
  }
}

// ─── LOCALITIES ──────────────────────────────────────────────────────────────

async function buildLocalities(routeSlugMap: Map<string, string>): Promise<void> {
  const pages = await queryAll(NOTION_LOCALITIES_DB!);
  clearDir(OUT.localities);

  for (const page of pages) {
    const slug = text(page, 'Slug');
    if (!slug) { console.warn(`  [locality] no slug on ${page.id}, skipping`); continue; }

    const routeIds  = relationIds(page, 'Route');
    const routeSlug = routeIds.length ? (routeSlugMap.get(routeIds[0]) ?? '') : '';

    const coverImage = await getCoverImage(page);
    const body       = await toMarkdown(page.id);

    const frontmatter = fm({
      name:           text(page, 'Name'),
      route:          routeSlug,
      km_to_santiago: num(page, 'Km to Santiago'),
      population:     num(page, 'Population') || undefined,
      languages:      multiSelect(page, 'Languages'),
      country:        'Spain',
      has_albergue:   false,
      has_hotel:      false,
      has_atm:        false,
      has_pharmacy:   false,
      has_supermarket: false,
      has_medical:    false,
      coverImage:     coverImage ?? undefined,
      published:      true,
    });

    fs.writeFileSync(path.join(OUT.localities, `${slug}.md`), `${frontmatter}\n\n${body}`);
    console.log(`  locality: ${slug}`);
  }
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('notion-build: fetching from Notion...');
  const t0 = Date.now();

  const routeSlugMap = await buildRoutes();
  await buildStages(routeSlugMap);
  await buildLocalities(routeSlugMap);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `notion-build: done in ${elapsed}s — ` +
    `${imagesUploaded} images uploaded, ${imagesSkipped} cached`,
  );
}

main().catch(err => {
  console.error('notion-build failed:', err);
  process.exit(1);
});
