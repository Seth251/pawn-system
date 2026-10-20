import test from 'node:test';
import assert from 'node:assert/strict';
import { dueDate, monthlyCents, nextDue, unpaidMonths, status, normalizeLoan, reminder, telegramURL, telegramFromQR, importBackup } from '../core.mjs';
const base = { id: 'loan-1', customer: 'ដារ៉ា', item: 'ទូរស័ព្ទ', telegram: 'Dara_123', phone: '', notes: '', amountCents: 10000, rateBps: 300, start: '2026-07-20', payments: [], closedAt: null };
test('3% monthly interest is $3 per $100, using cents', () => {
  assert.equal(monthlyCents(base), 300);
  assert.equal(monthlyCents({ ...base, amountCents: 50000 }), 1500);
  assert.equal(monthlyCents({ ...base, amountCents: 9999 }), 300);
});
test('due dates remain anchored to lending day through month end and leap years', () => {
  assert.equal(dueDate('2026-01-31', 1), '2026-02-28');
  assert.equal(dueDate('2026-01-31', 2), '2026-03-31');
  assert.equal(dueDate('2028-01-31', 1), '2028-02-29');
});
test('late payment clears one missed month without erasing older dues', () => {
  assert.equal(unpaidMonths(base, '2026-10-20'), 3);
  assert.equal(status(base, '2026-10-20'), 'overdue');
  const paid = { ...base, payments: [{ id: 'p1', period: 1, amountCents: 300, paidAt: '2026-10-20' }] };
  assert.equal(nextDue(paid), '2026-09-20');
  assert.equal(unpaidMonths(paid, '2026-10-20'), 2);
  assert.equal(status(paid, '2026-10-20'), 'overdue');
  assert.equal(status({ ...paid, closedAt: '2026-10-20' }, '2026-10-20'), 'closed');
});
test('normalization rejects bad dates, amounts, and unsafe Telegram contacts', () => {
  assert.equal(normalizeLoan(base, '2026-10-20').telegram, 'Dara_123');
  assert.throws(() => normalizeLoan({ ...base, start: '2026-02-30' }, '2026-10-20'));
  assert.throws(() => normalizeLoan({ ...base, amountCents: -1 }, '2026-10-20'));
  assert.throws(() => normalizeLoan({ ...base, telegram: 'javascript:alert(1)' }, '2026-10-20'));
  assert.ok(telegramURL(base, '2026-10-20').startsWith('https://t.me/Dara_123?text='));
  assert.ok(reminder(base, '2026-10-20').includes('$9.00'));
});
test('earlier PawnDesk JSON exports retain payment history and closed state', () => {
  const legacy = { exported: '2026-10-20T00:00:00Z', loans: [{ ...base, payments: [{ id: 'p1', period: 1, amountCents: 300, date: '2026-08-20' }], closed: true, closedDate: '2026-10-20' }] };
  const [loan] = importBackup(legacy, '2026-10-20');
  assert.equal(loan.payments[0].paidAt, '2026-08-20');
  assert.equal(loan.closedAt, '2026-10-20');
  assert.equal(loan.payments.length, 1);
});
test('Telegram QR profile links become safe direct chat contacts', () => {
  assert.equal(telegramFromQR('https://t.me/Dara_123?profile'), 'Dara_123');
  assert.equal(telegramFromQR('tg://resolve?domain=Dara_123'), 'Dara_123');
  assert.equal(telegramFromQR('https://t.me/+85512345678'), '+85512345678');
  assert.equal(telegramFromQR('https://t.me/+InviteHash'), null);
  assert.equal(telegramFromQR('https://evil.example/Dara_123'), null);
  assert.equal(telegramFromQR('https://t.me/%E0%A4%A'), null);
  assert.equal(telegramFromQR('https://t.me/contact/token'), null);
  const phoneLoan = normalizeLoan({ ...base, telegram: '+85512345678' }, '2026-10-20');
  assert.ok(telegramURL(phoneLoan, '2026-10-20').startsWith('https://t.me/+85512345678?text='));
});
