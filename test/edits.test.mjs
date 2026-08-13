import test from 'node:test';
import assert from 'node:assert/strict';
import { insertCookLogEntry, markTried, writePlan } from '../site/lib/edits.mjs';

const WITH_LOG = `---
title: Khao Soi
slug: khao-soi
status: tried
cook_log:
  - date: 2026-05-12
    note: "Used less sugar."
---

## Ingredients

- 400 ml | coconut milk
`;

const WITHOUT_LOG = `---
title: Palak Paneer
slug: palak-paneer
status: wishlist   # still to try
added: 2026-07-19
---

## Ingredients

- 500 g | spinach
`;

test('inserts at the top of an existing cook_log, leaving the rest byte-for-byte', () => {
  const out = insertCookLogEntry(WITH_LOG, { date: '2026-08-13', note: 'Great.' });
  assert.equal(out, `---
title: Khao Soi
slug: khao-soi
status: tried
cook_log:
  - date: 2026-08-13
    note: "Great."
  - date: 2026-05-12
    note: "Used less sugar."
---

## Ingredients

- 400 ml | coconut milk
`);
});

test('creates cook_log when absent, preserving other frontmatter including comments', () => {
  const out = insertCookLogEntry(WITHOUT_LOG, { date: '2026-08-13', note: 'First go.' });
  assert.match(out, /status: wishlist {3}# still to try/);
  assert.match(out, /\ncook_log:\n {2}- date: 2026-08-13\n {4}note: "First go\."\n---/);
  assert.equal(out.slice(out.indexOf('---', 4)), WITHOUT_LOG.slice(WITHOUT_LOG.indexOf('---', 4)));
});

test('quotes and backslashes in the note are escaped', () => {
  const out = insertCookLogEntry(WITH_LOG, { date: '2026-08-13', note: 'He said "more \\ chili"' });
  assert.match(out, /note: "He said \\"more \\\\ chili\\""/);
});

test('matches the indentation already used by the list', () => {
  const src = '---\ncook_log:\n    - date: 2026-01-01\n      note: "x"\n---\n';
  const out = insertCookLogEntry(src, { date: '2026-08-13', note: 'y' });
  assert.equal(out, '---\ncook_log:\n    - date: 2026-08-13\n      note: "y"\n    - date: 2026-01-01\n      note: "x"\n---\n');
});

test('rejects a file without frontmatter', () => {
  assert.throws(() => insertCookLogEntry('# just markdown\n', { date: '2026-08-13', note: 'x' }), /no frontmatter/);
});

test('markTried changes only the status value, keeping any trailing comment', () => {
  const out = markTried(WITHOUT_LOG);
  assert.equal(out, WITHOUT_LOG.replace('status: wishlist', 'status: tried'));
});

test('markTried is a no-op on an already-tried recipe', () => {
  assert.equal(markTried(WITH_LOG), WITH_LOG);
});

test('writePlan re-serializes the recipes list and keeps the body', () => {
  const src = '---\nname: Current plan\nupdated: 2026-08-01\nrecipes:\n  - slug: old\n---\nNotes stay.\n';
  const out = writePlan(src, [{ slug: 'khao-soi', servings: 2 }, { slug: 'chana-masala' }], '2026-08-13');
  assert.equal(out, '---\nname: Current plan\nupdated: 2026-08-13\nrecipes:\n  - slug: khao-soi\n    servings: 2\n  - slug: chana-masala\n---\nNotes stay.\n');
});
