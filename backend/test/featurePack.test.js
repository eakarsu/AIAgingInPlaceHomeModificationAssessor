'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { toCsv, filterRecords, validateTaskInput, buildDeterministicInsight, providerConfigured } = require('../lib/featurePack');

test('feature-pack: CSV export preserves 0 and false, escapes commas', () => {
  const csv = toCsv([{ id: 1, name: 'a,b', count: 0, active: false, note: '' }]);
  assert.match(csv, /id,name,count,active,note/);
  assert.match(csv, /"a,b",0,false,/);
});
test('feature-pack: search/filter matches q and exact status, keeps empty result', () => {
  const rows = [{ id: 1, title: 'Brake check', status: 'Open' }, { id: 2, title: 'Oil', status: 'Done' }];
  assert.deepEqual(filterRecords(rows, { q: 'brake' }).map((r) => r.id), [1]);
  assert.deepEqual(filterRecords(rows, { status: 'done' }).map((r) => r.id), [2]);
  assert.deepEqual(filterRecords(rows, { q: 'missing' }), []);
});
test('feature-pack: task validation requires title and valid status', () => {
  assert.ok(validateTaskInput({}).errors.length > 0);
  assert.ok(validateTaskInput({ title: 'x', status: 'nope' }).errors.length > 0);
  assert.deepEqual(validateTaskInput({ title: ' Do it ' }).value, { title: 'Do it' });
  assert.deepEqual(validateTaskInput({ status: 'done' }, { partial: true }).value, { status: 'done' });
});
test('feature-pack: deterministic fallback is labelled and preserves 0/empty', () => {
  const out = buildDeterministicInsight('demo', [], { label: 'Demo', numericKeys: ['cost'] });
  assert.equal(out.aiGenerated, false);
  assert.equal(out.mode, 'deterministic-fallback');
  assert.equal(out.metrics.totalRecords, 0);
  assert.equal(out.metrics.numericTotals.cost, 0);
  assert.equal(out.recordsConsidered, 0);
  assert.equal(providerConfigured({}), false);
});
