// Ingredient line grammar: `- <quantity> <unit> | <ingredient text>`
// quantity: number | decimal | fraction (1/2) | range (1-2). May be empty.
// unit: single free token. May be empty.
// The `|` is mandatory. Used by the build (validation) and the browser (shopping list).

const NUM = String.raw`\d+(?:\.\d+)?(?:\s*\/\s*\d+)?`;
const QTY_RE = new RegExp(`^(${NUM}(?:\\s*-\\s*${NUM})?)\\s*(.*)$`);

/**
 * @param {string} line raw list item text, without the leading `- `
 * @returns {{qty: string|null, unit: string|null, name: string}}
 * @throws {Error} on grammar violation
 */
export function parseIngredientLine(line) {
  const bar = line.indexOf('|');
  if (bar === -1) throw new Error('missing "|" separator');
  const left = line.slice(0, bar).trim();
  const name = line.slice(bar + 1).trim();
  if (!name) throw new Error('empty ingredient text after "|"');

  let qty = null;
  let unit = null;
  if (left) {
    const m = QTY_RE.exec(left);
    let rest = left;
    if (m) {
      qty = m[1].replace(/\s+/g, '');
      rest = m[2].trim();
    }
    if (rest) {
      if (/\s/.test(rest)) throw new Error(`unit must be a single token, got "${rest}"`);
      unit = rest;
    }
  }
  return { qty, unit, name };
}

/**
 * Parse the body of an `## Ingredients` section.
 * `### Foo` sub-headers set the section of the lines that follow.
 * @param {string} text
 * @param {number} lineOffset line number of `text`'s first line in the source file
 * @returns {{ok: Array, errors: Array<{line: number, reason: string}>}}
 */
export function parseIngredientsSection(text, lineOffset = 0) {
  const ok = [];
  const errors = [];
  let section = null;
  text.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    if (line.startsWith('###')) { section = line.replace(/^#+\s*/, '').trim(); return; }
    const item = /^[-*]\s+(.*)$/.exec(line);
    if (!item) return; // prose between items is allowed and ignored
    try {
      ok.push({ ...parseIngredientLine(item[1]), section });
    } catch (e) {
      errors.push({ line: lineOffset + i + 1, reason: `${e.message} — "${line}"` });
    }
  });
  return { ok, errors };
}

/** Numeric value of a quantity string, or null for empty/range/unparseable. */
export function qtyValue(qty) {
  if (!qty || qty.includes('-')) return null;
  const f = /^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(qty);
  if (f) return Number(f[1]) / Number(f[2]);
  const n = Number(qty);
  return Number.isFinite(n) ? n : null;
}

/** Format a number for display: 2dp max, no trailing zeros. */
export function fmtQty(n) {
  return String(Math.round(n * 100) / 100);
}
