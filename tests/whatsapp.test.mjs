import assert from 'node:assert/strict';
import test from 'node:test';
import {
  templates,
  contacts,
  previewCsv,
  validateContact,
  campaignReview,
  nextEligible,
} from '../app/whatsapp/demo.mjs';

test('catalog represents all seven supplied schemas without invented message text or languages', () => {
  assert.deepEqual(
    templates.map((t) => [t.count, t.pdf]),
    [
      [3, true],
      [4, true],
      [3, true],
      [3, false],
      [3, false],
      [3, false],
      [3, false],
    ],
  );
  assert(templates.every((t) => t.language === 'Unconfirmed' && !t.body));
});
test('contact edits preserve identity and CSV previews reject duplicates or malformed fields', () => {
  assert.equal(validateContact(contacts[0], contacts), '');
  assert.match(
    validateContact({ ...contacts[0], phone: '123' }, contacts),
    /international/,
  );
  const [good, duplicate] = previewCsv(
    'name,phone,consent,var_ref\r\n"One, Inc",+12025550185,Opted in,"a""b"\nTwo,+12025550185,Unknown,ref',
    contacts,
  );
  assert.equal(good.error, '');
  assert.equal(good.contact.name, 'One, Inc');
  assert.equal(good.contact.variables.ref, 'a"b');
  assert.match(duplicate.error, /exists/);
  assert.throws(
    () => previewCsv('name,phone,consent\n"unfinished', []),
    /quoting|incomplete/,
  );
  assert.throws(() => previewCsv('name,name,phone,consent', []), /optional/);
});
test('campaign review validates consent, personalized mappings and HTTPS attachment metadata', () => {
  const draft = {
    name: 'Sample',
    recipients: ['c0', 'c1'],
    mapping: ['name', 'var:period', 'var:reference'],
    pdf: 'https://example.invalid/sample.pdf',
  };
  const reviewed = campaignReview(draft, contacts, templates[0]);
  assert.match(campaignReview({ ...draft, pdf: 'https://example.invalid/file.png' }, contacts, templates[0]).errors.join(' '), /PDF URL/);
  assert.deepEqual(reviewed.errors, []);
  assert.deepEqual(reviewed.rows[1].values, [
    'Birch Trading',
    'April',
    'DEMO-102',
  ]);
  assert(
    campaignReview(
      {
        ...draft,
        recipients: ['c5'],
        pdf: 'http://unsafe.invalid',
        mapping: [],
      },
      contacts,
      templates[0],
    ).errors.length === 3,
  );
  assert(
    campaignReview({ ...draft, pdf: '' }, contacts, templates[3]).errors
      .length === 0,
  );
});
test('reminder advances from most recent attempt for every outcome and respects disabled intervals', () => {
  const base = {
    first: '2026-04-01T13:30:00Z',
    last: '2026-04-06T09:30:00Z',
    status: 'Enabled',
  };
  for (const days of [1, 3, 5, 7])
    assert.equal(
      Date.parse(nextEligible({ ...base, days })) - Date.parse(base.last),
      days * 86400000,
    );
  for (const days of [0, '', 2])
    assert.equal(nextEligible({ ...base, days }), null);
  assert.equal(nextEligible({ ...base, days: 3, status: 'Paused' }), null);
  assert.equal(nextEligible({ ...base, days: 3, last: null }), base.first);
});
