import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Window } from 'happy-dom';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const window = new Window({ url: 'https://seth251.github.io/pawn-system/' });
window.document.write(html);
globalThis.window = window;
globalThis.document = window.document;
globalThis.localStorage = window.localStorage;
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: window.navigator });
globalThis.cancelAnimationFrame = () => {};
globalThis.requestAnimationFrame = () => 0;
globalThis.confirm = () => true;
globalThis.setInterval = () => 0;
await import('../app.js');

test('pawn can be added with item and monthly interest, then edited', () => {
  document.getElementById('addLoan').click();
  const form = document.getElementById('loanForm');
  const field = name => form.elements.namedItem(name);
  field('customer').value = 'សុខ ដារ៉ា';
  field('itemCategory').value = 'phone';
  field('itemDetails').value = 'iPhone 15';
  field('amount').value = '100';
  field('rate').value = '3';
  field('start').value = '2026-10-20';
  field('telegram').value = '@Dara_123';
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  const records = JSON.parse(localStorage.getItem('pawn-kh-v1')).loans;
  assert.equal(records.length, 1);
  assert.equal(records[0].item, 'ទូរស័ព្ទ · iPhone 15');
  assert.equal(records[0].amountMinor, 10000);
  assert.equal(records[0].currency, 'USD');
  assert.equal(records[0].rateBps, 300);
  assert.match(document.getElementById('loanList').textContent, /iPhone 15/);
  document.querySelector('[data-action="edit"]').click();
  assert.equal(field('itemDetails').value, 'iPhone 15');
  assert.equal(field('itemCategory').value, 'phone');
});

test('riel percentage and fixed dollar contracts save, show separate totals, and record payments', () => {
  const form = document.getElementById('loanForm');
  const field = name => form.elements.namedItem(name);
  document.getElementById('closeModal').click();
  document.getElementById('addLoan').click();
  field('customer').value = 'វិសាល';
  field('itemCategory').value = 'motorcycle';
  field('currency').value = 'KHR';
  field('currency').dispatchEvent(new window.Event('input', { bubbles: true }));
  field('amount').value = '100000';
  field('rate').value = '3';
  field('start').value = '2026-10-20';
  field('telegram').value = '';
  field('itemCondition').value = 'good';
  field('storageLocation').value = 'ទូ A ថត 2';
  field('serialNumber').value = 'MOTO-007';
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  let records = JSON.parse(localStorage.getItem('pawn-kh-v1')).loans;
  assert.equal(records[1].currency, 'KHR');
  assert.equal(records[1].amountMinor, 100000);
  assert.equal(records[1].storageLocation, 'ទូ A ថត 2');
  assert.equal(document.getElementById('principalValue').textContent, '$100.00៛100,000');
  document.querySelector('[data-action="pay"][data-id="' + records[1].id + '"]').click();
  const paymentForm = document.getElementById('paymentForm');
  const paymentField = name => paymentForm.elements.namedItem(name);
  paymentField('paymentAmount').value = '1000';
  paymentForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  records = JSON.parse(localStorage.getItem('pawn-kh-v1')).loans;
  assert.equal(records[1].payments[0].amountMinor, 1000);
  assert.match(document.getElementById('loanList').textContent, /៛2,000/);
  document.querySelector('[data-action="pay"][data-id="' + records[1].id + '"]').click();
  paymentField('paymentType').value = 'principal';
  paymentField('paymentType').dispatchEvent(new window.Event('change', { bubbles: true }));
  paymentField('paymentAmount').value = '25000';
  paymentForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  records = JSON.parse(localStorage.getItem('pawn-kh-v1')).loans;
  assert.equal(records[1].principalPayments[0].amountMinor, 25000);
  assert.match(document.getElementById('principalValue').textContent, /៛75,000/);
  document.querySelector('[data-action="receipt"][data-id="' + records[1].id + '"]').click();
  assert.match(document.getElementById('receiptSheet').textContent, /៛75,000/);
  assert.match(document.getElementById('receiptSheet').textContent, /MOTO-007/);
  document.getElementById('closeReceipt').click();

  document.getElementById('addLoan').click();
  field('customer').value = 'លីណា';
  field('itemCategory').value = 'ring';
  field('itemCategory').dispatchEvent(new window.Event('change', { bubbles: true }));
  field('isGold').checked = true;
  field('isGold').dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(document.getElementById('goldFields').hidden, false);
  field('goldWeight').value = '2.5';
  field('goldUnit').value = 'chi';
  field('currency').value = 'USD';
  field('interestMode').value = 'fixed';
  field('interestMode').dispatchEvent(new window.Event('input', { bubbles: true }));
  field('amount').value = '200';
  field('fixed').value = '7.50';
  field('start').value = '2026-10-20';
  field('telegram').value = '@Dara_123';
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  records = JSON.parse(localStorage.getItem('pawn-kh-v1')).loans;
  assert.equal(records[2].interestMode, 'fixed');
  assert.equal(records[2].fixedMinor, 750);
  assert.equal(records[2].rateBps, 0);
  assert.equal(records[2].goldWeightMilli, 2500);
  assert.equal(records[2].goldUnit, 'chi');
  assert.match(document.getElementById('loanList').textContent, /\$7\.50/);
  assert.match(document.getElementById('loanList').textContent, /2\.5 ជី/);
  document.getElementById('itemFilter').value = 'gold-only';
  document.getElementById('itemFilter').dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(document.querySelectorAll('.loan-row').length, 1);
  document.getElementById('itemFilter').value = 'all';
  document.getElementById('itemFilter').dispatchEvent(new window.Event('change', { bubbles: true }));
});

test('gold category reveals required weight and legacy item edits retain their name', () => {
  const form = document.getElementById('loanForm');
  const field = name => form.elements.namedItem(name);
  document.getElementById('addLoan').click();
  field('itemCategory').value = 'gold';
  field('itemCategory').dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(field('isGold').checked, true);
  assert.equal(field('goldWeight').required, true);
  field('itemCategory').value = 'phone';
  field('itemCategory').dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(field('isGold').checked, false);
  assert.equal(field('goldWeight').disabled, true);
  document.getElementById('closeModal').click();
});

test('QR panel offers a readable fallback when camera is unavailable', () => {
  window.jsQR = () => null;
  document.getElementById('scanTelegramQR').click();
  assert.equal(document.getElementById('qrPanel').hidden, false);
  assert.match(document.getElementById('qrStatus').textContent, /កាមេរ៉ា/);
  document.getElementById('closeModal').click();
  assert.equal(document.getElementById('qrPanel').hidden, true);
});

test('downloaded backup restores all records after browser storage is cleared', async () => {
  const originalCreateURL = URL.createObjectURL;
  const originalClick = window.HTMLAnchorElement.prototype.click;
  let exportedBlob;
  let filename;
  URL.createObjectURL = blob => { exportedBlob = blob; return 'blob:test-backup'; };
  window.HTMLAnchorElement.prototype.click = function () { filename = this.download; };
  try {
    document.getElementById('exportData').click();
    assert.match(filename, /^pawn-system-backup-.*\.json$/);
    const backupText = await exportedBlob.text();
    const saved = JSON.parse(backupText);
    assert.equal(saved.version, 3);
    assert.ok(saved.loans.length > 0);
    assert.equal(saved.loans.length, JSON.parse(localStorage.getItem('pawn-kh-v1')).loans.length);

    localStorage.clear();
    window.dispatchEvent(new window.StorageEvent('storage', { key: 'pawn-kh-v1' }));
    assert.equal(document.getElementById('backupCount').textContent, '0 កិច្ចសន្យា');
    assert.equal(document.getElementById('importData').disabled, false);
    const input = document.getElementById('importFile');
    Object.defineProperty(input, 'files', { configurable: true, value: [{
      name: filename, size: exportedBlob.size, text: async () => backupText
    }] });
    input.dispatchEvent(new window.Event('change'));
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepEqual(JSON.parse(localStorage.getItem('pawn-kh-v1')).loans, saved.loans);
    assert.equal(document.getElementById('backupCount').textContent, `${saved.loans.length} កិច្ចសន្យា`);
  } finally {
    URL.createObjectURL = originalCreateURL;
    window.HTMLAnchorElement.prototype.click = originalClick;
  }
});

test('closing an overdue pawn records remaining interest and principal before printing', () => {
  const form = document.getElementById('loanForm');
  const field = name => form.elements.namedItem(name);
  document.getElementById('addLoan').click();
  field('customer').value = 'សុភា';
  field('itemCategory').value = 'other';
  field('itemCategory').dispatchEvent(new window.Event('change', { bubbles: true }));
  field('itemDetails').value = 'កាមេរ៉ា';
  field('amount').value = '100';
  field('rate').value = '3';
  field('start').value = '2026-07-20';
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  const key = 'pawn-kh-v1';
  let records = JSON.parse(localStorage.getItem(key)).loans;
  const loan = records.at(-1);
  assert.equal(loan.item, 'កាមេរ៉ា');
  document.querySelector(`[data-action="close"][data-id="${loan.id}"]`).click();
  records = JSON.parse(localStorage.getItem(key)).loans;
  const closed = records.at(-1);
  assert.ok(closed.closedAt);
  assert.equal(closed.principalPayments.at(-1).amountMinor, 10000);
  assert.ok(closed.payments.at(-1).amountMinor > 0);
  document.getElementById('itemFilter').value = 'all';
  document.querySelector('[data-filter="closed"]').click();
  document.querySelector(`[data-action="receipt"][data-id="${loan.id}"]`).click();
  assert.match(document.getElementById('receiptSheet').textContent, /ប្រាក់ដើមនៅសល់៛?\$0\.00/);
  document.getElementById('closeReceipt').click();
});
