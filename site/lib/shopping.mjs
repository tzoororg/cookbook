import { qtyValue, fmtQty } from './ingredients.mjs';

/** lowercase, trim, drop trailing descriptors after a comma. */
export function normalizeName(name) {
  return name.split(',')[0].trim().toLowerCase();
}

// ponytail: keyword table, not a food ontology. Unknown -> Other. Display grouping only.
// Tested first to last — shelf-stable wins, so "fish sauce" and "coconut milk" are Pantry,
// not Protein and Dairy.
const CATEGORIES = [
  ['Pantry', /\b(oil|flour|sugar|salt|rice|noodles?|pasta|lentils?|dal|chickpeas?|beans?|stock|broth|sauce|paste|vinegar|spice|ground|masala|cumin|turmeric|cardamom|cinnamon|canned|tinned|coconut|honey|syrup|yeast|soda|powder)\b/i],
  ['Produce', /\b(onions?|shallots?|garlic|ginger|tomato(?:es)?|potato(?:es)?|peppers?|chill?i(?:es)?|basil|cilantro|coriander|parsley|mint|limes?|lemons?|spinach|carrots?|celery|cucumber|mushrooms?|cabbage|scallions?|lettuce|greens|herbs?|apples?|mangoe?s?|aubergines?|eggplants?|courgettes?|zucchini)\b/i],
  ['Dairy', /\b(milk|cream|butter|yoghurt|yogurt|cheese|ghee|paneer)\b/i],
  ['Protein', /\b(chicken|beef|pork|lamb|fish|prawns?|shrimps?|tofu|eggs?|mince|thighs?|breasts?|legs?|bacon)\b/i],
];

export function categoryOf(name) {
  for (const [label, re] of CATEGORIES) if (re.test(name)) return label;
  return 'Other';
}

/**
 * Aggregate a meal plan's ingredients into a grouped shopping list.
 * @param {Array<{recipe: object, servings: number}>} entries
 * @returns {Array<{name: string, items: Array<{key: string, text: string, from: string}>}>}
 */
export function aggregate(entries) {
  const buckets = new Map();

  for (const { recipe, servings } of entries) {
    const base = Number(recipe.servings) || 0;
    const scale = base > 0 && servings ? servings / base : 1;

    for (const ing of recipe.ingredients || []) {
      const name = normalizeName(ing.name);
      const unit = (ing.unit || '').toLowerCase();
      const value = qtyValue(ing.qty);
      // Scalable and unscalable (range / unmeasured) lines never merge into each other.
      const key = `${name}|${unit}|${value === null ? 'r' : 'n'}`;
      let b = buckets.get(key);
      if (!b) {
        b = { name: ing.name.split(',')[0].trim(), unit: ing.unit || '', qty: ing.qty, total: 0, from: [] };
        buckets.set(key, b);
      }
      if (value !== null) b.total += value * scale;
      if (!b.from.includes(recipe.title)) b.from.push(recipe.title);
    }
  }

  const groups = new Map();
  for (const [key, b] of buckets) {
    const scalable = key.endsWith('|n');
    const qty = scalable ? fmtQty(b.total) : b.qty || '';
    const text = [qty, b.unit, b.name].filter(Boolean).join(' ');
    const from = b.from.join(' · ') + (!scalable && b.qty ? ` (×${b.from.length})` : '');
    const cat = categoryOf(b.name);
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push({ key, text, from });
  }

  const order = ['Produce', 'Protein', 'Dairy', 'Pantry', 'Other'];
  return order
    .filter((c) => groups.has(c))
    .map((name) => ({ name, items: groups.get(name).sort((a, b) => a.text.localeCompare(b.text)) }));
}
