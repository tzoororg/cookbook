# Cookbook

A personal cookbook. Recipes are markdown files in `recipes/`; the repo is the database.
A build script validates them and emits a static site to `dist/`, published to GitHub Pages.

No framework, no bundler — vanilla ES modules in the browser.

## Run it

```bash
npm ci && node scripts/build.mjs && node scripts/serve.mjs
```

That serves `dist/` at <http://localhost:8080/cookbook/> — a subpath, because Pages projects sites
live under one. All URLs in the site are relative, so it works at any base.

```bash
npm test        # ingredient parser, shopping-list aggregator, cook-log inserter
```

## Adding recipes

Write `recipes/<slug>.md` (see [CLAUDE.md](CLAUDE.md) for the format and the ingredient grammar),
put photos in `photos/<slug>/`, run the build, commit. The build is the validator: it prints
file, line and reason for every problem and exits 1.

## Editing from the browser

Three things can be changed without a checkout: marking a wishlist recipe as tried, adding a cook
log entry, and adding/removing recipes from the meal plan. Each writes one commit through the
GitHub Contents API.

Open **Settings** and provide:

- a **fine-grained personal access token** scoped to this repository only, with
  **Contents: read and write** — nothing else,
- the repo as `username/cookbook`, and the branch (`main`).

The token is kept in `localStorage` in your browser and sent only to `api.github.com`. Anyone with
access to that browser profile can read it — use a repo-scoped fine-grained token with a short
expiry, and revoke it if the machine is shared.

Without a token the site is fully browsable and every write button is disabled with a hint.

## Deploy

Push to `main`. The workflow in `.github/workflows/deploy.yml` runs `npm ci`, the tests and the
build, then publishes `dist/` to Pages. Enable Pages with source "GitHub Actions" once, in the
repository settings.

## Layout

```
recipes/            one .md per recipe
photos/<slug>/      originals; resized to 1200px at build time
plans/current.md    the active meal plan
site/               frontend source (copied verbatim into dist/)
  lib/              parser, aggregator and file-edit helpers — shared by the build and the browser
scripts/build.mjs   validate + emit dist/index.json
test/               node --test
```

`site/lib/` is the reason the aggregator behaves identically in the build and in the browser:
one copy, imported by both, covered by the tests.
