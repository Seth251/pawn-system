import test from 'node:test';
import assert from 'node:assert/strict';
import { dueDate, monthlyCents, nextDue, unpaidMonths, status, normalizeLoan, reminder, telegramURL, telegramFromQR, importBackup, money, goldWeightText, interestDueAmount, principalRemaining } from '../core.mjs';
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
test('partial interest stays due until paid, while principal payments reduce balance', () => {
  const loan = normalizeLoan({ ...base, payments: [{ id: 'part1', amountMinor: 125, paidAt: '2026-08-20' }],
    principalPayments: [{ id: 'principal1', amountMinor: 2500, paidAt: '2026-08-20' }] }, '2026-10-20');
  assert.equal(nextDue(loan), '2026-08-20');
  assert.equal(unpaidMonths(loan, '2026-10-20'), 3);
  assert.equal(interestDueAmount(loan, '2026-10-20'), 775);
  assert.equal(principalRemaining(loan), 7500);
  assert.equal(monthlyCents(loan), 300, 'the original monthly term remains fixed');
  assert.equal(status(loan, '2026-10-20'), 'overdue');
  const paid = normalizeLoan({ ...loan, payments: [...loan.payments, { id: 'part2', amountMinor: 175, paidAt: '2026-10-20' }] }, '2026-10-20');
  assert.equal(nextDue(paid), '2026-09-20');
  assert.equal(interestDueAmount(paid, '2026-10-20'), 600);
  assert.match(reminder(loan, '2026-10-20'), /\$1\.75/);
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
  assert.equal(loan.currency, 'USD');
  assert.equal(loan.payments[0].amountMinor, 300);
  assert.equal(loan.itemCategory, 'other');
  assert.equal(loan.itemDetails, base.item);
});
test('old version 1 backup is converted without losing payments', () => {
  const [loan] = importBackup({ version: 1, loans: [{ ...base, payments: [{ id: 'p1', period: 1, amountCents: 300, paidAt: '2026-08-20' }] }] }, '2026-10-20');
  assert.equal(loan.amountMinor, 10000);
  assert.equal(loan.interestMode, 'percent');
  assert.equal(loan.payments[0].amountMinor, 300);
  assert.deepEqual(loan.principalPayments, []);
});
test('version 3 backup preserves inventory and partial payment ledger, rejects overpayment', () => {
  const loan = normalizeLoan({ ...base, itemCondition: 'used', storageLocation: 'ទូ A', serialNumber: 'SN-42',
    payments: [{ id: 'part', amountMinor: 100, paidAt: '2026-08-20' }],
    principalPayments: [{ id: 'principal', amountMinor: 2000, paidAt: '2026-08-20' }] }, '2026-10-20');
  assert.deepEqual(importBackup({ version: 3, loans: [loan] }, '2026-10-20')[0], loan);
  assert.equal(loan.storageLocation, 'ទូ A');
  assert.throws(() => normalizeLoan({ ...loan, principalPayments: [{ id: 'too-much', amountMinor: 10001, paidAt: '2026-08-20' }] }, '2026-10-20'));
  assert.throws(() => normalizeLoan({ ...loan, itemCondition: 'fake' }, '2026-10-20'));
});
test('fixed riel interest keeps currency in reminders and version 2 backups', () => {
  const loan = normalizeLoan({ ...base, currency: 'KHR', amountMinor: 100000, amountCents: undefined,
    interestMode: 'fixed', rateBps: 0, fixedMinor: 7500, payments: [] }, '2026-10-20');
  assert.equal(monthlyCents(loan), 7500);
  assert.equal(money(loan.amountMinor, loan.currency), '៛100,000');
  assert.match(reminder(loan, '2026-10-20'), /៛7,500/);
  assert.deepEqual(importBackup({ version: 2, loans: [loan] }, '2026-10-20')[0], loan);
  assert.equal(normalizeLoan({ ...loan, telegram: '' }, '2026-10-20').telegram, '');
  assert.equal(telegramURL({ ...loan, telegram: '' }), null);
  assert.throws(() => normalizeLoan({ ...loan, currency: 'KHR', amountMinor: 100000.5 }, '2026-10-20'));
});
test('gold jewelry saves weight and unit through normalization and backup', () => {
  const loan = normalizeLoan({ ...base, itemCategory: 'necklace', itemDetails: 'លេខ ៣',
    isGold: true, goldWeightMilli: 2750, goldUnit: 'chi' }, '2026-10-20');
  assert.equal(loan.item, 'ខ្សែក · លេខ ៣');
  assert.equal(goldWeightText(loan), '2.75 ជី');
  assert.deepEqual(importBackup({ version: 2, loans: [loan] }, '2026-10-20')[0], loan);
  assert.throws(() => normalizeLoan({ ...loan, goldWeightMilli: 0 }, '2026-10-20'));
  assert.throws(() => normalizeLoan({ ...loan, goldUnit: 'ounces' }, '2026-10-20'));
  assert.throws(() => normalizeLoan({ ...loan, itemCategory: 'unknown' }, '2026-10-20'));
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
