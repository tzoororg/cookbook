#!/usr/bin/env node
// Build: validate recipes -> dist/index.json + resized photos + site/ copy.
// Fails loudly (exit 1) on any schema or ingredient-grammar violation.

import { readFile, writeFile, readdir, mkdir, cp, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import sharp from 'sharp';
import { parseIngredientsSection } from '../site/lib/ingredients.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const p = (...a) => path.join(root, ...a);

const errors = [];
const fail = (file, line, reason) =>
  errors.push(`${file}${line ? `:${line}` : ''} — ${reason}`);

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Line number (1-based) of a frontmatter key in the raw file. */
const keyLine = (raw, key) => {
  const i = raw.split('\n').findIndex((l) => l.startsWith(key + ':'));
  return i === -1 ? null : i + 1;
};

/** Split a markdown body into `## Heading` sections, keeping each one's start line. */
function splitSections(body, offset) {
  const out = {};
  let name = null;
  let buf = [];
  let start = offset;
  const flush = () => { if (name) out[name.toLowerCase()] = { text: buf.join('\n'), line: start }; };
  body.split('\n').forEach((l, i) => {
    const h = /^##\s+(.+?)\s*$/.exec(l);
    if (h) { flush(); name = h[1]; buf = []; start = offset + i + 1; }
    else buf.push(l);
  });
  flush();
  return out;
}

function parseSteps(text) {
  const steps = [];
  for (const line of text.split('\n')) {
    const m = /^\s*(?:\d+\.|[-*])\s+(.*)$/.exec(line);
    if (m) steps.push(m[1].trim());
    else if (line.trim() && steps.length) steps[steps.length - 1] += ' ' + line.trim();
  }
  return steps;
}

async function loadRecipes() {
  const dir = p('recipes');
  if (!existsSync(dir)) return [];
  const files = (await readdir(dir)).filter((f) => f.endsWith('.md')).sort();
  const recipes = [];

  for (const file of files) {
    const rel = `recipes/${file}`;
    const raw = await readFile(path.join(dir, file), 'utf8');
    let fm, body;
    try {
      ({ data: fm, content: body } = matter(raw));
    } catch (e) {
      fail(rel, null, `invalid frontmatter: ${e.message}`);
      continue;
    }
    const bodyOffset = raw.split('\n').length - body.split('\n').length;

    for (const k of ['title', 'slug', 'status', 'added']) {
      if (!fm[k]) fail(rel, null, `missing required field "${k}"`);
    }
    const expected = file.replace(/\.md$/, '');
    if (fm.slug && fm.slug !== expected) {
      fail(rel, keyLine(raw, 'slug'), `slug "${fm.slug}" does not match filename "${expected}"`);
    }
    if (fm.status && !['wishlist', 'tried'].includes(fm.status)) {
      fail(rel, keyLine(raw, 'status'), `status must be "wishlist" or "tried", got "${fm.status}"`);
    }
    const dateStr = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d));
    if (fm.added && !ISO.test(dateStr(fm.added))) {
      fail(rel, keyLine(raw, 'added'), `added must be an ISO date (YYYY-MM-DD)`);
    }
    for (const e of fm.cook_log || []) {
      if (!e || !e.date || !ISO.test(dateStr(e.date))) {
        fail(rel, keyLine(raw, 'cook_log'), `cook_log entry needs an ISO date`);
      }
    }

    const sections = splitSections(body, bodyOffset);
    if (!sections.ingredients) fail(rel, null, 'missing "## Ingredients" section');
    if (!sections.steps) fail(rel, null, 'missing "## Steps" section');

    let ingredients = [];
    if (sections.ingredients) {
      const r = parseIngredientsSection(sections.ingredients.text, sections.ingredients.line);
      ingredients = r.ok;
      for (const e of r.errors) fail(rel, e.line, `ingredient line: ${e.reason}`);
      if (!ingredients.length) fail(rel, sections.ingredients.line, 'no ingredient lines found');
    }

    const photos = [];
    for (const photo of fm.photos || []) {
      const src = p('photos', expected, photo);
      if (!existsSync(src)) fail(rel, keyLine(raw, 'photos'), `photo not found: photos/${expected}/${photo}`);
      else photos.push({ src, out: `photos/${expected}/${photo}` });
    }

    recipes.push({
      title: fm.title,
      slug: fm.slug,
      tags: fm.tags || [],
      servings: fm.servings ?? null,
      source_url: fm.source_url || null,
      status: fm.status,
      added: fm.added ? dateStr(fm.added) : null,
      cook_log: (fm.cook_log || []).map((e) => ({ date: dateStr(e.date), note: e.note || '' })),
      ingredients,
      steps: sections.steps ? parseSteps(sections.steps.text) : [],
      notes: sections.notes ? sections.notes.text.trim() : '',
      photos: photos.map((x) => x.out),
      _photoSrcs: photos,
    });
  }
  return recipes;
}

async function loadPlan() {
  const file = p('plans/current.md');
  if (!existsSync(file)) return null;
  const raw = await readFile(file, 'utf8');
  const { data, content } = matter(raw);
  const entries = (data.recipes || []).map((r) => ({ slug: r.slug, servings: r.servings ?? null }));
  for (const e of entries) if (!e.slug) fail('plans/current.md', null, 'plan entry missing slug');
  const updated = data.updated instanceof Date ? data.updated.toISOString().slice(0, 10) : String(data.updated || '');
  if (updated && !ISO.test(updated)) fail('plans/current.md', null, 'updated must be an ISO date');
  return { name: data.name || 'Current plan', updated, recipes: entries, notes: content.trim() };
}

async function resizePhotos(recipes) {
  for (const r of recipes) {
    for (const { src, out } of r._photoSrcs) {
      const dest = p('dist', out);
      await mkdir(path.dirname(dest), { recursive: true });
      if (existsSync(dest)) {
        const [a, b] = await Promise.all([stat(src), stat(dest)]);
        if (b.mtimeMs >= a.mtimeMs) continue;
      }
      await sharp(src).resize({ width: 1200, withoutEnlargement: true }).toFile(dest);
    }
    delete r._photoSrcs;
  }
}

const recipes = await loadRecipes();
const plan = await loadPlan();

if (plan) {
  const slugs = new Set(recipes.map((r) => r.slug));
  for (const e of plan.recipes) {
    if (!slugs.has(e.slug)) fail('plans/current.md', null, `unknown recipe slug "${e.slug}"`);
  }
}

if (errors.length) {
  console.error(`\nBuild failed — ${errors.length} problem(s):\n`);
  for (const e of errors) console.error('  ' + e);
  console.error('');
  process.exit(1);
}

await mkdir(p('dist'), { recursive: true });
await resizePhotos(recipes);
await cp(p('site'), p('dist'), { recursive: true });
await mkdir(p('dist/vendor'), { recursive: true });
await cp(p('node_modules/marked/lib/marked.esm.js'), p('dist/vendor/marked.esm.js'));
await writeFile(p('dist/index.json'), JSON.stringify({ recipes, plan }, null, 2));

console.log(`Built ${recipes.length} recipes, plan with ${plan ? plan.recipes.length : 0} entries → dist/`);
