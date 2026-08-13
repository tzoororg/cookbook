import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregate, normalizeName } from '../site/lib/shopping.mjs';

const ing = (qty, unit, name) => ({ qty, unit, name, section: null });
const recipe = (title, servings, ingredients) => ({ title, slug: title.toLowerCase(), servings, ingredients });

const flat = (groups) => groups.flatMap((g) => g.items.map((i) => [i.text, i.from]));
const find = (groups, text) => flat(groups).find(([t]) => t === text);

test('matching name + unit merge, and quantities scale by servings', () => {
  const groups = aggregate([
    { recipe: recipe('Curry', 4, [ing('400', 'ml', 'coconut milk')]), servings: 2 },
    { recipe: recipe('Soup', 2, [ing('250', 'ml', 'coconut milk')]), servings: 2 },
  ]);
  // 400 * (2/4) = 200, plus 250 unscaled
  assert.deepEqual(find(groups, '450 ml coconut milk'), ['450 ml coconut milk', 'Curry · Soup']);
});

test('trailing descriptors after a comma are stripped for matching', () => {
  assert.equal(normalizeName('Chicken Thigh, sliced thin'), 'chicken thigh');
  const groups = aggregate([
    { recipe: recipe('A', 2, [ing('300', 'g', 'chicken thigh, sliced')]), servings: 2 },
    { recipe: recipe('B', 2, [ing('200', 'g', 'Chicken thigh')]), servings: 2 },
  ]);
  assert.deepEqual(find(groups, '500 g chicken thigh'), ['500 g chicken thigh', 'A · B']);
});

test('same name with different units stays on separate lines', () => {
  const groups = aggregate([
    { recipe: recipe('A', 2, [ing('100', 'g', 'butter')]), servings: 2 },
    { recipe: recipe('B', 2, [ing('2', 'tbsp', 'butter')]), servings: 2 },
  ]);
  assert.ok(find(groups, '100 g butter'));
  assert.ok(find(groups, '2 tbsp butter'));
});

test('ranges are shown as-is, annotated with the recipe count, never scaled', () => {
  const groups = aggregate([
    { recipe: recipe('A', 2, [ing('1-2', 'tsp', 'fish sauce')]), servings: 8 },
    { recipe: recipe('B', 2, [ing('1-2', 'tsp', 'fish sauce')]), servings: 2 },
  ]);
  assert.deepEqual(find(groups, '1-2 tsp fish sauce'), ['1-2 tsp fish sauce', 'A · B (×2)']);
});

test('a range and a measured amount of the same thing do not merge into a wrong total', () => {
  const groups = aggregate([
    { recipe: recipe('A', 2, [ing('1-2', 'tsp', 'fish sauce')]), servings: 2 },
    { recipe: recipe('B', 2, [ing('2', 'tsp', 'fish sauce')]), servings: 2 },
  ]);
  assert.ok(find(groups, '1-2 tsp fish sauce'));
  assert.ok(find(groups, '2 tsp fish sauce'));
});

test('unmeasured items are listed once with the recipes that need them', () => {
  const groups = aggregate([
    { recipe: recipe('A', 2, [ing(null, null, 'thai basil, a handful')]), servings: 4 },
    { recipe: recipe('B', 2, [ing(null, null, 'Thai basil')]), servings: 2 },
  ]);
  assert.deepEqual(find(groups, 'thai basil'), ['thai basil', 'A · B']);
});

test('fractional quantities scale and sum', () => {
  const groups = aggregate([
    { recipe: recipe('A', 2, [ing('1/2', 'tsp', 'turmeric')]), servings: 4 },
    { recipe: recipe('B', 4, [ing('1', 'tsp', 'turmeric')]), servings: 4 },
  ]);
  assert.ok(find(groups, '2 tsp turmeric')); // 0.5*2 + 1
});

test('items land in display categories', () => {
  const groups = aggregate([
    { recipe: recipe('A', 2, [ing('2', null, 'onions'), ing('300', 'g', 'chicken thigh'), ing('1', 'tbsp', 'oil')]), servings: 2 },
  ]);
  assert.deepEqual(groups.map((g) => g.name), ['Produce', 'Protein', 'Pantry']);
});
