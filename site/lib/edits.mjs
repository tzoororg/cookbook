// Targeted edits on raw recipe/plan files. Everything outside the intended
// region must survive byte-for-byte, so these are string surgery, not re-serialization.

/** @returns {{start: number, end: number}|null} char offsets of the frontmatter body (between the --- fences) */
function frontmatterBounds(raw) {
  if (!raw.startsWith('---\n') && !raw.startsWith('---\r\n')) return null;
  const start = raw.indexOf('\n') + 1;
  const m = /^---[ \t]*$/m.exec(raw.slice(start));
  if (!m) return null;
  return { start, end: start + m.index };
}

/** `status: wishlist` -> `status: tried`, touching nothing else. */
export function markTried(raw) {
  const b = frontmatterBounds(raw);
  if (!b) throw new Error('no frontmatter');
  const fm = raw.slice(b.start, b.end);
  const re = /^(status:[ \t]*)(?:wishlist|tried)([ \t]*(?:#.*)?)$/m;
  if (!re.test(fm)) throw new Error('no status line in frontmatter');
  return raw.slice(0, b.start) + fm.replace(re, '$1tried$2') + raw.slice(b.end);
}

function yamlQuote(s) {
  return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

/**
 * Insert a cook-log entry at the top of the `cook_log:` list, creating the key if absent.
 * @param {string} raw whole file contents
 * @param {{date: string, note: string}} entry
 */
export function insertCookLogEntry(raw, entry) {
  const b = frontmatterBounds(raw);
  if (!b) throw new Error('no frontmatter');
  const fm = raw.slice(b.start, b.end);
  const nl = fm.includes('\r\n') ? '\r\n' : '\n';

  const key = /^cook_log:[ \t]*$/m.exec(fm);
  if (!key) {
    const block =
      `cook_log:${nl}  - date: ${entry.date}${nl}    note: ${yamlQuote(entry.note)}${nl}`;
    const padded = fm.endsWith(nl) || fm === '' ? fm : fm + nl;
    return raw.slice(0, b.start) + padded + block + raw.slice(b.end);
  }

  const after = key.index + key[0].length + nl.length;
  // Match the indentation of the existing first item, if any.
  const first = /^([ \t]*)-[ \t]/.exec(fm.slice(after));
  const indent = first ? first[1] : '  ';
  const cont = indent + '  ';
  const block =
    `${indent}- date: ${entry.date}${nl}${cont}note: ${yamlQuote(entry.note)}${nl}`;
  return raw.slice(0, b.start) + fm.slice(0, after) + block + fm.slice(after) + raw.slice(b.end);
}

/**
 * Rewrite the plan's frontmatter recipes list. plans/current.md is machine-owned,
 * so a full re-serialize of the frontmatter is fine here.
 * @param {string} raw
 * @param {Array<{slug: string, servings?: number}>} recipes
 * @param {string} updated ISO date
 */
export function writePlan(raw, recipes, updated) {
  const b = frontmatterBounds(raw);
  if (!b) throw new Error('no frontmatter');
  const nameLine = /^name:.*$/m.exec(raw.slice(b.start, b.end));
  const lines = [nameLine ? nameLine[0] : 'name: Current plan', `updated: ${updated}`, 'recipes:'];
  for (const r of recipes) {
    lines.push(`  - slug: ${r.slug}`);
    if (r.servings != null) lines.push(`    servings: ${r.servings}`);
  }
  return raw.slice(0, b.start) + lines.join('\n') + '\n' + raw.slice(b.end);
}
