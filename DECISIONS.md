# Decisions

Choices made where the technical spec and the design were both silent, or where they disagreed.
Spec wins on behaviour, design wins on visuals — that rule resolved everything else.

## Shopping list categories (Produce / Pantry / Protein / …)

The design groups the shopping list under category headings; the spec's aggregation section never
mentions categories. Rather than add a `category:` field to the recipe schema (a change to the
spec's data model), `site/lib/shopping.mjs` maps an ingredient name to a category with a small
keyword table, falling back to **Other**. Display only — it does not affect merging.

## Ranges mixed with measured amounts

The spec says ranges are shown as-is and never scaled, and that matching name+unit merge. It does
not say what happens when one recipe calls for `1-2 tsp fish sauce` and another for `2 tsp`.
Summing them would be wrong (the range has no single value) and dropping either would lose an
ingredient, so they are kept as two lines. Covered by a test.

## Print view

The design ships a separate print page. Implementing it as a second HTML document would duplicate
the aggregator's output. Instead the plan view carries an `@media print` block that hides
everything except the shopping list and renders empty checkboxes — same output, one page.

## Step timers

The design's recipe page has per-step timer buttons; the spec never mentions timers. Durations are
detected from the step text (`simmer for 35–40 minutes` → 40:00, upper bound of a range). No timer
button appears when a step names no duration.

## Checkbox persistence

Shopping-list checks persist in `localStorage` keyed by the plan's `updated` date, per the spec.
Ingredient checks on a recipe page are deliberately *not* persisted — they are scratch state for
one cooking session and are cleared when you navigate away.

## `marked` in the browser

The spec says ship raw markdown and render client-side with `marked`. The build copies
`node_modules/marked/lib/marked.esm.js` into `dist/vendor/` rather than loading it from a CDN, so
the site has no third-party runtime dependency. Google Fonts is still loaded from Google, as in the
design.

## Recipe body parsing

The spec asks for parsed ingredients in `index.json`. The build also splits the body into `steps`
and `notes` there, because the design renders steps as individually numbered blocks with their own
timer buttons — which needs them as an array, not one blob of HTML. The raw markdown of each step
and of the notes is still what ships; `marked` renders it in the browser.

## Settings modal as a route

The design shows Settings as a modal; the spec lists `#/settings` as a route. Both: `#/settings`
opens the modal over whatever view was underneath, and closing returns to the previous hash.

## Extras beyond the spec's dependency list

None. `gray-matter`, `marked` and `sharp` only. `scripts/serve.mjs` (local subpath preview) is
~30 lines of `node:http` rather than a static-server dependency.
