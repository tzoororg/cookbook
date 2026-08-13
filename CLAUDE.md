# CLAUDE.md — cookbook repo

This repo **is** the database. Recipes are markdown files; the site is built from them.
Heavy work (adding recipes, editing bodies, photos) happens here in Claude Code.
Small edits (mark tried, cook log, meal plan) happen in the browser via the GitHub API —
never hand-edit the same file in both places at once.

**Always run `node scripts/build.mjs` before committing.** It is the validator. If it exits 1,
the commit would break the site.

## Layout

```
recipes/<slug>.md        one recipe, filename must equal its `slug:`
photos/<slug>/*.jpg      originals; the build resizes to 1200px into dist/
plans/current.md         the single active meal plan (machine-owned — the site rewrites it)
site/                    frontend source, copied verbatim into dist/
scripts/build.mjs        validate + emit dist/index.json
```

## Recipe file format

```markdown
---
title: Thai Green Curry
slug: thai-green-curry            # must equal the filename
tags: [thai, curry, weeknight]
servings: 2
source_url: https://example.com/green-curry   # omit for own/generated recipes
status: tried                     # wishlist | tried
added: 2026-08-13                 # ISO date
photos: [pot.jpg]                 # files under photos/<slug>/
cook_log:                         # omit entirely if never cooked
  - date: 2026-08-20
    note: "Halved the sugar, added extra basil. Great."
---

## Ingredients

- 400 ml | coconut milk
- 1 | red bell pepper
- | thai basil, a handful
- 1-2 tsp | fish sauce

## Steps

1. ...

## Notes

Freeform.
```

Required: `title`, `slug`, `status`, `added`, an `## Ingredients` section and a `## Steps` section.

### Ingredient grammar — the shopping list depends on it

`- <quantity> <unit> | <ingredient text>`

- **The `|` is mandatory on every ingredient line.** The build rejects lines without it.
- quantity: number, decimal (`0.5`), fraction (`1/2`) or range (`1-2`). May be empty.
- unit: one token (`g`, `ml`, `tbsp`, `cup`). May be empty for count items (`1 | red bell pepper`).
- Both empty is fine for unmeasured items: `- | thai basil, a handful`.
- `### For the sauce` sub-headers inside Ingredients are kept for display and ignored when
  aggregating the shopping list.
- Put the descriptor after a comma (`chicken thigh, sliced`) — the aggregator matches on the part
  before the comma, so `chicken thigh, sliced` and `chicken thigh` merge.

### Measurements

- **Liquids are always volume** — `ml`, `l`, `tsp`, `tbsp`, `cup`. Never weigh a liquid.
- **Solids given by weight also get a volume**, as a descriptor after the comma:
  `- 95 g | red lentils, 1/2 cup`. The quantity stays the weight so the shopping list totals in
  grams; the aggregator strips everything after the comma, so the volume never breaks merging.
  Don't put the volume in parentheses before the comma — `rice (1/2 cup)` and `rice (1 cup)` are
  different names to the aggregator and would split into two shopping-list lines.
- **Butter is grams only.** No cups, no sticks, no tablespoons, and no volume descriptor.

## Adding a recipe from a URL

1. Fetch the page and extract title, servings, ingredients and steps.
2. Write `recipes/<slug>.md` in the format above. `source_url` is the page. `status: wishlist`
   unless the user says they have already cooked it. `added` is today.
3. Convert each ingredient to the grammar — split quantity/unit from the name and insert the `|`.
   Do not invent quantities; if the source says "a handful", write `- | basil, a handful`.
4. Save any photos to `photos/<slug>/` and list the filenames in `photos:`.
5. Run `node scripts/build.mjs`. Fix everything it reports.
6. Ship it — see [Shipping](#shipping).

## Generating a recipe from requirements

Same as above, minus the fetch: no `source_url`, `status: wishlist` by default, and say in
`## Notes` that it is untested.

## Meal plan

`plans/current.md` is rewritten wholesale by the site's meal-plan buttons. Edit it here only when
the site is not being used at the same time; keep the frontmatter shape:

```markdown
---
name: Current plan
updated: 2026-08-13
recipes:
  - slug: khao-soi
    servings: 2       # optional override; defaults to the recipe's own servings
  - slug: chana-masala
---
```

## Shipping

Work is not done when it builds. It is done when it is live on
[the site](https://tzoororg.github.io/cookbook/). Every time, without being asked:

1. `node scripts/build.mjs` and `npm test` — both green.
2. Commit, then **push to `main`**. The push is what deploys; `.github/workflows/deploy.yml`
   builds and publishes `dist/` to Pages.
3. Watch the run to completion: `gh run watch $(gh run list -L1 --json databaseId -q '.[0].databaseId')`.
   A red run means the site is still on the old build — fix and re-push, don't report success.
4. Verify what is actually served, don't trust the green check:
   `curl -s https://tzoororg.github.io/cookbook/index.json | grep <something-new-this-push>`.
   Pages can lag the run by a minute; retry before concluding it failed.
5. Only once step 4 passes, post a deploy stamp with `PushNotification` — one line, under
   200 chars, in this shape:

   ```
   cookbook @ <short-sha> live on pages
   <n> recipes · Pages <duration> · <what changed>
   ```

   No stamp if the deploy did not verify. Silence is the failure state, a stamp is a claim
   that someone can open the URL right now and see the change.

## Don'ts

- Don't edit `dist/` — it is build output.
- Don't re-serialize a recipe's frontmatter to change one field; the site preserves formatting and
  comments, and so should you.
- Don't add dependencies. The build is `gray-matter` + `marked` + `sharp`; the frontend is vanilla
  ES modules with no bundler.
