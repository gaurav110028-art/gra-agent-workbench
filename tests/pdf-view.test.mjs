import test from 'node:test';
import assert from 'node:assert/strict';
import { pagePoint, editBox } from '../lib/redactor/pdf-view.mjs';
const page = { width: 800, height: 600 };
test('PDF pointer mapping is invariant across zoom, negative scroll offsets and responsive sizes', () => {
  for (const width of [300, 600, 1200, 1800]) for (const left of [20, -430]) {
    const bounds = { left, top: -270, width, height: width * .75 };
    assert.deepEqual(pagePoint(left + width * .25, bounds.top + bounds.height * .4, bounds, page), { x: 200, y: 240 });
  }
  assert.deepEqual(pagePoint(-200, 900, { left: 0, top: 0, width: 400, height: 300 }, page), { x: 0, y: 600 });
  assert.throws(() => pagePoint(0, 0, { left: 0, top: 0, width: 0, height: 0 }, page));
});
test('PDF keyboard/pointer move and resize retain integer pixel coordinates and page bounds', () => {
  const box = { x: 100, y: 100, width: 150, height: 50 };
  assert.deepEqual(editBox(box, 1, -1, page), { ...box, x: 101, y: 99 });
  assert.deepEqual(editBox(box, 20, 15, page, true), { ...box, width: 170, height: 65 });
  assert.deepEqual(editBox(box, 10000, -10000, page), { ...box, x: 650, y: 0 });
  assert.deepEqual(editBox(box, -10000, 10000, page, true), { ...box, width: 2, height: 500 });
  assert.deepEqual(box, { x: 100, y: 100, width: 150, height: 50 });
});
