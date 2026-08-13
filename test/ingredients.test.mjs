import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIngredientLine, parseIngredientsSection, qtyValue } from '../site/lib/ingredients.mjs';

test('quantity + unit + name', () => {
  assert.deepEqual(parseIngredientLine('400 ml | coconut milk'), { qty: '400', unit: 'ml', name: 'coconut milk' });
});

test('count item has no unit', () => {
  assert.deepEqual(parseIngredientLine('1 | red bell pepper'), { qty: '1', unit: null, name: 'red bell pepper' });
});

test('unmeasured item has neither', () => {
  assert.deepEqual(parseIngredientLine('| thai basil, a handful'), {
    qty: null, unit: null, name: 'thai basil, a handful',
  });
});

test('fractions, decimals and ranges are quantities', () => {
  assert.equal(parseIngredientLine('1/2 tsp | turmeric').qty, '1/2');
  assert.equal(parseIngredientLine('0.5 kg | flour').qty, '0.5');
  assert.equal(parseIngredientLine('1-2 tsp | fish sauce').qty, '1-2');
  assert.equal(parseIngredientLine('1 - 2 tsp | fish sauce').qty, '1-2');
});

test('a bare unit with no quantity is allowed', () => {
  assert.deepEqual(parseIngredientLine('pinch | saffron'), { qty: null, unit: 'pinch', name: 'saffron' });
});

test('missing separator is rejected', () => {
  assert.throws(() => parseIngredientLine('400 ml coconut milk'), /missing "\|"/);
});

test('empty ingredient text is rejected', () => {
  assert.throws(() => parseIngredientLine('400 ml |   '), /empty ingredient text/);
});

test('multi-token unit is rejected', () => {
  assert.throws(() => parseIngredientLine('400 heaping ml | flour'), /single token/);
});

test('sub-sections are captured and errors carry line numbers', () => {
  const { ok, errors } = parseIngredientsSection(
    ['', '### For the sauce', '- 2 tbsp | soy sauce', '- 1 clove garlic', '', '### To serve', '- | lime wedges'].join('\n'),
    10,
  );
  assert.deepEqual(ok.map((i) => [i.name, i.section]), [
    ['soy sauce', 'For the sauce'],
    ['lime wedges', 'To serve'],
  ]);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].line, 14);
  assert.match(errors[0].reason, /missing "\|"/);
});

test('qtyValue: numbers and fractions resolve, ranges and blanks do not', () => {
  assert.equal(qtyValue('400'), 400);
  assert.equal(qtyValue('1/2'), 0.5);
  assert.equal(qtyValue('0.25'), 0.25);
  assert.equal(qtyValue('1-2'), null);
  assert.equal(qtyValue(null), null);
});
