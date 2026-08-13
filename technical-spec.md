# Technical Spec — Personal Cookbook Site

Git-backed markdown cookbook. Static site on GitHub Pages; the repo is the database. Heavy edits via Claude Code in the repo; small edits from the browser via the GitHub Contents API.

## 1. Repo layout

```
cookbook/
├── recipes/                 # one .md per recipe, slug filenames (thai-green-curry.md)
├── photos/<recipe-slug>/    # original photos per recipe
├── plans/current.md         # the active meal plan (single plan in v1)
├── site/                    # frontend source (html, css, js modules)
├── scripts/build.mjs        # build script
├── dist/                    # build output (published to Pages)
├── .github/workflows/deploy.yml
├── CLAUDE.md
└── README.md
```

## 2. Recipe file format

YAML frontmatter + markdown body.

```markdown
---
title: Thai Green Curry
slug: thai-green-curry            # must match filename
tags: [thai, curry, weeknight]
servings: 2
source_url: https://example.com/green-curry   # optional; absent for AI-generated/own
status: tried                     # wishlist | tried
added: 2026-08-13
photos: [pot.jpg, plated.jpg]     # files under photos/thai-green-curry/
cook_log:
  - date: 2026-08-20
    note: "Halved the sugar, added extra basil. Great."
---

## Ingredients

- 400 ml | coconut milk
- 2 tbsp | green curry paste
- 300 g | chicken thigh, sliced
- 1 | red bell pepper
- | thai basil, a handful
- 1-2 tsp | fish sauce

## Steps

1. Fry the curry paste in the thick part of the coconut milk...
2. ...

## Notes

Freeform notes, substitutions, links.
```

### Ingredient line grammar (critical — shopping list depends on it)
Each ingredient is a list item: `quantity unit | ingredient text`
- `quantity`: number, decimal, fraction (`1/2`), or range (`1-2`). May be empty.
- `unit`: free token (g, ml, tbsp, tsp, cup, pcs...). May be empty (count items: `1 | red bell pepper`).
- Empty quantity+unit allowed: `- | thai basil, a handful` (unmeasured item).
- The `|` separator is mandatory on every line. Build validation rejects ingredient lines without it.
- Sub-section headers inside Ingredients are allowed as `### For the sauce` and preserved for display, ignored for aggregation grouping.

## 3. Meal plan format

```markdown
---
name: Current plan
updated: 2026-08-13
recipes:
  - slug: thai-green-curry
    servings: 4              # optional override; default = recipe servings
  - slug: dal-tadka
---
Optional freeform notes.
```

## 4. Build script (`scripts/build.mjs`)

Node 20+. Allowed deps: `gray-matter` (frontmatter), `marked` (markdown). Steps:
1. Read all `recipes/*.md`; parse frontmatter and body.
2. Validate: required fields (title, slug, status, added), slug==filename, status enum, dates ISO, every ingredient line matches the grammar, referenced photos exist. On any error: print file + line + reason, exit 1.
3. Parse the Ingredients section into structured `{qty, unit, name, section}` per line.
4. Resize photos to max width 1200px into `dist/photos/...` (use `sharp`; skip unchanged files by mtime).
5. Emit `dist/index.json`: array of recipes with all frontmatter + parsed ingredients + rendered-HTML body (or raw body — see below) + photo paths. Also embed the parsed meal plan.
6. Copy `site/` into `dist/`.

Frontend is a small SPA shell: `index.html` loads `app.js`, which fetches `index.json` and renders client-side (hash routing: `#/`, `#/wishlist`, `#/recipe/<slug>`, `#/plan`, `#/settings`). Rationale: one JSON fetch, instant client-side filtering/search, and write flows already require JS. Ship raw markdown bodies in index.json and render with `marked` in the browser (keeps build simpler, one renderer).

## 5. Browser write flows (GitHub Contents API)

Settings stores in localStorage: `{ token, owner, repo, branch: "main" }`. Fine-grained PAT, Contents read/write on this repo only.

Generic single-file edit:
1. `GET /repos/{owner}/{repo}/contents/{path}` → content (base64) + `sha`.
2. Modify in memory (see per-flow rules). 3. `PUT` same path with new content, `sha`, and a descriptive commit message.
4. On 200: optimistic update of in-memory store + "saved ✓". On 409 (sha conflict): re-GET and retry once. On 401: toast "token invalid" + open settings. On network error: toast, no state change.

Edits modify only the intended part:
- **Mark tried**: change `status: wishlist` → `status: tried` line in frontmatter (string surgery on the raw file — regex the single line; do not re-serialize the whole frontmatter, to preserve formatting/comments).
- **Add cook-log entry**: insert entry into `cook_log:` list (create the key if absent) — this is the one structured edit; implement a tiny targeted YAML-list inserter, with tests.
- **Meal plan add/remove**: rewrite `plans/current.md` frontmatter recipes list (this file is machine-owned; full re-serialize is fine here).

Commit messages: `site: mark <slug> as tried`, `site: cook log for <slug>`, `site: update meal plan`.

No PAT configured → read-only mode: action buttons disabled with hint, banner links to settings.

## 6. Shopping list aggregation

For the current plan: scale each recipe's ingredient quantities by `servings_override / recipe.servings` (skip scaling for empty/range quantities — show range as-is annotated with recipe count). Merge lines whose normalized ingredient name AND unit match (name normalization: lowercase, trim, strip trailing descriptors after comma). Non-matching units for the same name: list separately. Unmeasured items: list once with recipe names. Check state lives in localStorage keyed by plan `updated` date (resets when plan changes).

## 7. Deploy

GitHub Actions on push to main: checkout → `npm ci` → `node scripts/build.mjs` → upload `dist/` → deploy to Pages. Site must also work from a subpath (`/cookbook/`) — use relative URLs everywhere.

## 8. CLAUDE.md contract (for Claude Code sessions in the repo)

Instructions to include: how to add a recipe from a URL (fetch page, extract, write file matching this spec's schema and ingredient grammar, place photos, run build to validate, commit); how to generate a recipe from user requirements and add it (status: wishlist by default); always run `node scripts/build.mjs` before committing.

## 9. Out of scope for v1

Multiple meal plans, in-browser recipe creation/editing of full recipes, photo upload from browser, recipe scaling UI on the recipe page (only in shopping list), auth beyond PAT.
