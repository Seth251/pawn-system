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
  assert.equal(typeof form.elements.item, 'function', 'item collides with the collection method');
  field('customer').value = 'សុខ ដារ៉ា';
  field('item').value = 'iPhone 15';
  field('amount').value = '100';
  field('rate').value = '3';
  field('start').value = '2026-10-20';
  field('telegram').value = '@Dara_123';
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  const records = JSON.parse(localStorage.getItem('pawn-kh-v1')).loans;
  assert.equal(records.length, 1);
  assert.equal(records[0].item, 'iPhone 15');
  assert.equal(records[0].amountMinor, 10000);
  assert.equal(records[0].currency, 'USD');
  assert.equal(records[0].rateBps, 300);
  assert.match(document.getElementById('loanList').textContent, /iPhone 15/);
  document.querySelector('[data-action="edit"]').click();
  assert.equal(field('item').value, 'iPhone 15');
});

test('riel percentage and fixed dollar contracts save, show separate totals, and record payments', () => {
  const form = document.getElementById('loanForm');
  const field = name => form.elements.namedItem(name);
  document.getElementById('closeModal').click();
  document.getElementById('addLoan').click();
  field('customer').value = 'វិសាល';
  field('item').value = 'ម៉ូតូ';
  field('currency').value = 'KHR';
  field('currency').dispatchEvent(new window.Event('input', { bubbles: true }));
  field('amount').value = '100000';
  field('rate').value = '3';
  field('start').value = '2026-10-20';
  field('telegram').value = '';
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  let records = JSON.parse(localStorage.getItem('pawn-kh-v1')).loans;
  assert.equal(records[1].currency, 'KHR');
  assert.equal(records[1].amountMinor, 100000);
  assert.equal(document.getElementById('principalValue').textContent, '$100.00៛100,000');
  document.querySelector('[data-action="pay"][data-id="' + records[1].id + '"]').click();
  records = JSON.parse(localStorage.getItem('pawn-kh-v1')).loans;
  assert.equal(records[1].payments[0].amountMinor, 3000);

  document.getElementById('addLoan').click();
  field('customer').value = 'លីណា';
  field('item').value = 'ចិញ្ចៀន';
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
  assert.match(document.getElementById('loanList').textContent, /\$7\.50/);
});

test('QR panel offers a readable fallback when camera is unavailable', () => {
  window.jsQR = () => null;
  document.getElementById('scanTelegramQR').click();
  assert.equal(document.getElementById('qrPanel').hidden, false);
  assert.match(document.getElementById('qrStatus').textContent, /កាមេរ៉ា/);
  document.getElementById('closeModal').click();
  assert.equal(document.getElementById('qrPanel').hidden, true);
});
