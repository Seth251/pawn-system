import { STORAGE_KEY, todayKH, validDate, monthlyCents, nextDue, unpaidMonths,
  interestPaid, interestDueAmount, principalRemaining,
  status, money, khDate, normalizeLoan, telegramURL, importBackup, telegramFromQR,
  ITEM_CATEGORIES, ITEM_CONDITIONS, goldWeightText } from './core.mjs';

const $ = id => document.getElementById(id);
const control = (form, name) => form.elements.namedItem(name);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[c]);
const labels = { overdue: 'ហួសថ្ងៃបង់', today: 'ដល់ថ្ងៃបង់', soon: 'ជិតដល់ថ្ងៃបង់', upcoming: 'មិនទាន់ដល់ថ្ងៃ', closed: 'បានបញ្ចប់' };
const minor = (value, currency) => Math.round(Number(value) * (currency === 'USD' ? 100 : 1));
const displayAmount = (value, currency) => currency === 'USD' ? (value / 100).toFixed(2) : String(value);
function totals(records, value) {
  const sum = currency => records.filter(l => l.currency === currency).reduce((n, l) => n + value(l), 0);
  return { USD: sum('USD'), KHR: sum('KHR') };
}
function showTotals(id, amounts) {
  const el = $(id);
  el.textContent = '';
  el.classList.add('dual-total');
  for (const currency of ['USD', 'KHR']) {
    const line = document.createElement('span');
    line.textContent = money(amounts[currency], currency);
    el.append(line);
  }
}
let loans = [];
let filter = 'active';
let editingId = null;
let paymentLoanId = null;
let toastTimer;

function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4200);
}
function load() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"version":1,"loans":[]}');
    if (![1, 2, 3].includes(stored.version) || !Array.isArray(stored.loans)) throw Error('Invalid data');
    const valid = stored.loans.map(item => normalizeLoan(item));
    if (new Set(valid.map(l => l.id)).size !== valid.length) throw Error('Duplicate IDs');
    loans = valid;
  } catch {
    loans = [];
    toast('មិនអាចអានទិន្នន័យចាស់បានទេ។ សូមស្ដារឯកសារបម្រុងទុក។');
  }
}
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 3, loans }));
    return true;
  } catch {
    toast('មិនអាចរក្សាទុកបានទេ។ សូមពិនិត្យកន្លែងផ្ទុកលើឧបករណ៍។');
    return false;
  }
}
function commit(change) {
  const previous = structuredClone(loans);
  change();
  if (!save()) { loans = previous; return false; }
  render();
  return true;
}

function render() {
  const date = todayKH();
  $('backupCount').textContent = `${loans.length} កិច្ចសន្យា`;
  $('exportData').disabled = loans.length === 0;
  const active = loans.filter(l => !l.closedAt);
  const alerts = active.filter(l => ['overdue', 'today'].includes(status(l, date)));
  const overdue = alerts.filter(l => status(l, date) === 'overdue').length;
  $('headerDate').textContent = khDate(date);
  showTotals('principalValue', totals(active, principalRemaining));
  showTotals('interestValue', totals(active, l => interestDueAmount(l, date)));
  $('activeValue').textContent = `${active.length} កិច្ចសន្យាកំពុងដំណើរការ`;
  $('reminderValue').textContent = `${alerts.length} នាក់`;
  $('overdueValue').textContent = `${overdue} ហួសថ្ងៃ · ${alerts.length - overdue} ដល់ថ្ងៃ`;
  $('navAlert').textContent = String(alerts.length);
  $('tabAlert').textContent = String(alerts.length);
  $('notice').classList.toggle('needs-action', alerts.length > 0);
  $('notice').innerHTML = alerts.length
    ? `<span class="notice-icon">♧</span><div><strong>មានអតិថិជន ${alerts.length} នាក់ត្រូវរំលឹក</strong><p>ការប្រាក់ដល់ថ្ងៃបង់ ឬហួសថ្ងៃបង់ហើយ។ ចុច Telegram ដើម្បីបើកសាររំលឹក។</p></div>`
    : `<span class="notice-icon">✓</span><div><strong>មិនមានអតិថិជនត្រូវរំលឹកថ្ងៃនេះទេ</strong><p>ការជូនដំណឹងធ្វើបច្ចុប្បន្នភាពពេលអ្នកបើកកម្មវិធី។</p></div>`;
  document.querySelectorAll('[data-filter]').forEach(button => {
    button.classList.toggle('active', button.dataset.filter === filter);
    button.classList.toggle('selected', button.dataset.filter === filter);
  });
  const query = $('search').value.trim().toLocaleLowerCase();
  const itemFilter = $('itemFilter').value;
  const shown = loans.filter(l => {
    if (filter === 'closed') return !!l.closedAt;
    if (l.closedAt) return false;
    if (filter === 'alert') return ['overdue', 'today'].includes(status(l, date));
    return true;
  }).filter(l => itemFilter === 'all' || (itemFilter === 'gold-only' ? l.isGold : l.itemCategory === itemFilter))
    .filter(l => [l.customer, l.item, ITEM_CATEGORIES[l.itemCategory], l.telegram, l.phone, l.notes,
      l.storageLocation, l.serialNumber, goldWeightText(l)]
    .join(' ').toLocaleLowerCase().includes(query))
    .sort((a, b) => (a.closedAt ? a.closedAt : nextDue(a)).localeCompare(b.closedAt ? b.closedAt : nextDue(b)));
  $('recordCount').textContent = String(shown.length);
  $('loanList').innerHTML = shown.length ? shown.map(l => row(l, date)).join('') :
    `<div class="empty"><span class="empty-symbol">◈</span><strong>${loans.length ? 'មិនមានការបញ្ចាំក្នុងបញ្ជីនេះទេ' : 'ចាប់ផ្ដើមកត់ត្រាការបញ្ចាំដំបូង'}</strong><p>${loans.length ? 'សាកល្បងពាក្យស្វែងរក ឬជ្រើសផ្ទាំងផ្សេង។' : 'បន្ថែមអតិថិជន ទំនិញ និងប្រាក់ដែលបានឱ្យខ្ចី។ កម្មវិធីនឹងគណនាថ្ងៃបង់រៀងរាល់ខែ។'}</p>${loans.length ? '' : '<button class="button primary" data-action="new">＋ បន្ថែមការបញ្ចាំ</button>'}</div>`;
}
function row(l, date) {
  const state = status(l, date);
  const missed = unpaidMonths(l, date);
  const interestDue = interestDueAmount(l, date);
  const partialBalance = interestPaid(l) % monthlyCents(l)
    ? monthlyCents(l) - interestPaid(l) % monthlyCents(l) : 0;
  const historyEntries = [
    ...l.payments.map(p => ({ ...p, kind: 'ការប្រាក់' })),
    ...l.principalPayments.map(p => ({ ...p, kind: 'ប្រាក់ដើម' }))
  ].sort((a, b) => b.paidAt.localeCompare(a.paidAt));
  const history = historyEntries.length ? historyEntries.map(p =>
    `<div class="history-line"><span>${p.kind}${p.period ? ` · ខែទី ${p.period}` : ''} · ${khDate(p.paidAt)}</span><strong>${money(p.amountMinor, l.currency)}</strong></div>`).join('')
    : '<p>មិនទាន់មានការបង់ប្រាក់ដែលបានកត់ត្រាទេ។</p>';
  const tg = !l.closedAt ? telegramURL(l, date) : null;
  return `<article class="loan-row">
    <div class="person"><span class="initial">${escapeHTML(l.customer.slice(0, 1))}</span><span><strong>${escapeHTML(l.customer)}</strong><small>${escapeHTML(l.item)}</small>${l.isGold ? `<small class="gold-weight">◆ ទម្ងន់មាស ${escapeHTML(goldWeightText(l))}</small>` : ''}<em>${l.telegram ? (l.telegram.startsWith('+') ? '' : '@') + escapeHTML(l.telegram) : 'មិនទាន់មាន Telegram'}</em></span></div>
    <div class="loan-number"><strong>${money(principalRemaining(l), l.currency)}</strong><small>ប្រាក់ដើមនៅសល់ · ដើម ${money(l.amountMinor, l.currency)}</small><small>ការប្រាក់ ${money(monthlyCents(l), l.currency)} / ខែ · ${l.interestMode === 'fixed' ? 'ចំនួនថេរ' : l.rateBps / 100 + '%'}</small></div>
    <div><span class="due-text">${l.closedAt ? 'បិទនៅ ' + khDate(l.closedAt) : khDate(nextDue(l))}</span><span class="badge ${state}">${labels[state]}</span>${!l.closedAt && interestDue ? `<span class="missed">ការប្រាក់នៅសល់ ${money(interestDue, l.currency)}${missed > 1 ? ` · ${missed} ខែ` : ''}</span>` : !l.closedAt && partialBalance ? `<span class="balance-note">ខែបន្ទាប់នៅសល់ ${money(partialBalance, l.currency)}</span>` : ''}</div>
    <div class="row-actions">${tg ? `<a class="telegram" href="${escapeHTML(tg)}" target="_blank" rel="noopener noreferrer">✉ បើក Telegram ↗</a>` : ''}${!l.closedAt ? `<button class="action-small" data-action="pay" data-id="${escapeHTML(l.id)}">＋ កត់ត្រាការបង់ប្រាក់</button>` : ''}<button class="action-small" data-action="receipt" data-id="${escapeHTML(l.id)}">▤ មើល / បោះពុម្ពបង្កាន់ដៃ</button><button class="action-small" data-action="edit" data-id="${escapeHTML(l.id)}">កែព័ត៌មាន</button>${!l.closedAt ? `<button class="action-small close" data-action="close" data-id="${escapeHTML(l.id)}">បញ្ចប់ការបញ្ចាំ</button>` : ''}</div>
    <details class="row-details"><summary>ព័ត៌មានទំនិញ និងប្រវត្តិបង់ប្រាក់</summary><p>ថ្ងៃឱ្យខ្ចី៖ ${khDate(l.start)}${l.phone ? ` · ទូរស័ព្ទ៖ ${escapeHTML(l.phone)}` : ''}</p><p>ស្ថានភាព៖ ${l.itemCondition ? ITEM_CONDITIONS[l.itemCondition] : 'មិនបានកំណត់'} · ទីតាំង៖ ${escapeHTML(l.storageLocation || 'មិនបានកំណត់')}${l.serialNumber ? ` · លេខសម្គាល់៖ ${escapeHTML(l.serialNumber)}` : ''}</p>${l.notes ? `<p>កំណត់ចំណាំ៖ ${escapeHTML(l.notes)}</p>` : ''}${history}${l.payments.length && !l.closedAt ? `<button class="action-small close" data-action="undo-interest" data-id="${escapeHTML(l.id)}">លុបការបង់ការប្រាក់ចុងក្រោយ</button>` : ''}${l.principalPayments.length && !l.closedAt ? `<button class="action-small close" data-action="undo-principal" data-id="${escapeHTML(l.id)}">លុបការបង់ប្រាក់ដើមចុងក្រោយ</button>` : ''}</details>
  </article>`;
}
function previewInterest() {
  const form = $('loanForm');
  const currency = control(form, 'currency').value;
  const mode = control(form, 'interestMode').value;
  const fixed = mode === 'fixed';
  const unit = currency === 'KHR' ? '៛' : '$';
  const step = currency === 'KHR' ? '1' : '0.01';
  const max = currency === 'KHR' ? '1000000000000' : '100000000';
  $('amountLabel').firstChild.textContent = `ប្រាក់ដែលឱ្យខ្ចី (${unit})`;
  $('fixedLabel').firstChild.textContent = `ការប្រាក់ថេរប្រចាំខែ (${unit})`;
  for (const name of ['amount', 'fixed']) {
    const field = control(form, name);
    field.step = step; field.min = step; field.max = max;
    field.placeholder = currency === 'KHR' ? '100000' : name === 'amount' ? '100.00' : '3.00';
  }
  $('rateLabel').hidden = fixed;
  $('fixedLabel').hidden = !fixed;
  control(form, 'rate').disabled = fixed || control(form, 'currency').disabled;
  control(form, 'fixed').disabled = !fixed || control(form, 'currency').disabled;
  control(form, 'rate').required = !fixed;
  control(form, 'fixed').required = fixed;
  const amount = minor(control(form, 'amount').value, currency);
  const bps = Math.round(Number(control(form, 'rate').value) * 100);
  const interest = fixed ? minor(control(form, 'fixed').value, currency) : Math.round(amount * bps / 10000);
  $('interestPreview').textContent = amount > 0 && interest > 0
    ? `ការប្រាក់ប្រចាំខែ៖ ${money(interest, currency)} (${fixed ? 'ចំនួនថេរ' : `ប្រាក់ដើម ${money(amount, currency)} × ${bps / 100}%`})`
    : 'បញ្ចូលប្រាក់ដើម និងការប្រាក់ ដើម្បីមើលចំនួនត្រូវបង់ក្នុងមួយខែ។';
}
function updateItemFields() {
  const form = $('loanForm');
  const category = control(form, 'itemCategory').value;
  const gold = control(form, 'isGold');
  if (category === 'gold') gold.checked = true;
  gold.disabled = category === 'gold';
  const enabled = gold.checked;
  $('goldFields').hidden = !enabled;
  control(form, 'goldWeight').disabled = !enabled;
  control(form, 'goldWeight').required = enabled;
  control(form, 'goldUnit').disabled = !enabled;
  control(form, 'itemDetails').required = category === 'other';
  control(form, 'itemDetails').placeholder = category === 'other'
    ? 'សរសេរឈ្មោះទំនិញ' : 'ឧ. ម៉ូដែល ពណ៌ ឬលេខសម្គាល់';
}
function openForm(loan = null) {
  stopQR();
  editingId = loan?.id ?? null;
  const form = $('loanForm');
  form.reset();
  $('modalTitle').textContent = loan ? 'កែព័ត៌មានការបញ្ចាំ' : 'បន្ថែមការបញ្ចាំ';
  control(form, 'customer').value = loan?.customer ?? '';
  control(form, 'itemCategory').value = loan?.itemCategory ?? '';
  control(form, 'itemDetails').value = loan?.itemDetails ?? '';
  control(form, 'isGold').checked = !!loan?.isGold;
  control(form, 'goldWeight').value = loan?.goldWeightMilli ? String(loan.goldWeightMilli / 1000) : '';
  control(form, 'goldUnit').value = loan?.goldUnit ?? 'g';
  control(form, 'itemCondition').value = loan?.itemCondition ?? '';
  control(form, 'storageLocation').value = loan?.storageLocation ?? '';
  control(form, 'serialNumber').value = loan?.serialNumber ?? '';
  control(form, 'currency').value = loan?.currency ?? 'USD';
  control(form, 'interestMode').value = loan?.interestMode ?? 'percent';
  control(form, 'amount').value = loan ? displayAmount(loan.amountMinor, loan.currency) : '';
  control(form, 'rate').value = loan?.interestMode === 'percent' ? loan.rateBps / 100 : 3;
  control(form, 'fixed').value = loan?.interestMode === 'fixed' ? displayAmount(loan.fixedMinor, loan.currency) : '';
  control(form, 'start').value = loan?.start ?? todayKH();
  control(form, 'start').max = todayKH();
  control(form, 'telegram').value = loan?.telegram ? (loan.telegram.startsWith('+') ? loan.telegram : '@' + loan.telegram) : '';
  control(form, 'phone').value = loan?.phone ?? '';
  control(form, 'notes').value = loan?.notes ?? '';
  const locked = !!loan && (loan.payments.length > 0 || loan.principalPayments.length > 0 || !!loan.closedAt);
  for (const field of ['currency', 'interestMode', 'amount', 'start']) control(form, field).disabled = locked;
  $('lockedTerms').hidden = !locked;
  updateItemFields();
  previewInterest();
  $('loanModal').hidden = false;
  control(form, 'customer').focus();
}
function closeForm() { stopQR(); $('loanModal').hidden = true; editingId = null; }
function paymentLimit(loan, type) {
  if (type === 'principal') return principalRemaining(loan);
  const due = interestDueAmount(loan);
  const current = monthlyCents(loan) - interestPaid(loan) % monthlyCents(loan);
  return Math.min(due || current, monthlyCents(loan) * 1199 - interestPaid(loan));
}
function updatePaymentSummary(resetAmount = false) {
  const loan = loans.find(l => l.id === paymentLoanId);
  if (!loan) return;
  const form = $('paymentForm');
  const type = control(form, 'paymentType').value;
  const limit = paymentLimit(loan, type);
  const field = control(form, 'paymentAmount');
  const step = loan.currency === 'KHR' ? '1' : '0.01';
  field.step = step;
  field.min = step;
  field.max = displayAmount(limit, loan.currency);
  if (resetAmount) field.value = limit ? displayAmount(limit, loan.currency) : '';
  const entered = minor(field.value, loan.currency);
  const remainder = Math.max(0, limit - (Number.isFinite(entered) ? entered : 0));
  const kind = type === 'principal' ? 'ប្រាក់ដើម' : interestDueAmount(loan) ? 'ការប្រាក់ដល់ថ្ងៃបង់' : 'ការប្រាក់ខែបន្ទាប់';
  $('paymentSummary').innerHTML = `<strong>${kind}៖ ${money(limit, loan.currency)}</strong><span>បង់ចំនួននេះរួច នៅសល់ ${money(remainder, loan.currency)}${type === 'interest' && interestDueAmount(loan) ? ' ដែលដល់ថ្ងៃបង់' : ''}</span>`;
  $('paymentAmountLabel').firstChild.textContent = `ចំនួន${kind}ដែលបានទទួល (${loan.currency === 'KHR' ? '៛' : '$'})`;
  form.querySelector('[type="submit"]').disabled = limit < 1;
}
function openPayment(loan) {
  paymentLoanId = loan.id;
  const form = $('paymentForm');
  form.reset();
  control(form, 'paymentDate').value = todayKH();
  control(form, 'paymentDate').min = loan.start;
  control(form, 'paymentDate').max = todayKH();
  control(form, 'paymentType').querySelector('[value="principal"]').disabled = principalRemaining(loan) === 0;
  $('paymentContext').textContent = `${loan.customer} · ${loan.item}`;
  updatePaymentSummary(true);
  $('paymentModal').hidden = false;
  control(form, 'paymentAmount').focus();
}
function closePayment() { $('paymentModal').hidden = true; paymentLoanId = null; }
function receiptLine(label, value) {
  return `<div class="receipt-line"><span>${label}</span><strong>${escapeHTML(value)}</strong></div>`;
}
function openReceipt(loan) {
  const date = todayKH();
  const history = [
    ...loan.payments.map(p => ({ ...p, kind: 'ការប្រាក់' })),
    ...loan.principalPayments.map(p => ({ ...p, kind: 'ប្រាក់ដើម' }))
  ].sort((a, b) => a.paidAt.localeCompare(b.paidAt));
  $('receiptSheet').innerHTML = `<p class="receipt-kicker">ប្រព័ន្ធគ្រប់គ្រងការបញ្ជាំ</p><h2 id="receiptTitle">បង្កាន់ដៃការបញ្ជាំ</h2>
    <p class="receipt-meta">លេខកំណត់ត្រា៖ ${escapeHTML(loan.id)}<br>ចេញនៅថ្ងៃទី ${khDate(date)}</p>
    <h3>ព័ត៌មានអតិថិជន និងទំនិញ</h3>
    ${receiptLine('ឈ្មោះអតិថិជន', loan.customer)}${receiptLine('ទំនិញ', loan.item)}
    ${loan.isGold ? receiptLine('ទម្ងន់មាស', goldWeightText(loan)) : ''}
    ${loan.itemCondition ? receiptLine('ស្ថានភាពទំនិញ', ITEM_CONDITIONS[loan.itemCondition]) : ''}
    ${loan.serialNumber ? receiptLine('លេខសម្គាល់', loan.serialNumber) : ''}
    ${loan.phone ? receiptLine('ទូរស័ព្ទ', loan.phone) : ''}
    <h3>ព័ត៌មានប្រាក់</h3>
    ${receiptLine('ថ្ងៃឱ្យខ្ចី', khDate(loan.start))}
    ${receiptLine('ប្រាក់ដើមដែលបានឱ្យខ្ចី', money(loan.amountMinor, loan.currency))}
    ${receiptLine('ប្រាក់ដើមនៅសល់', money(principalRemaining(loan), loan.currency))}
    ${receiptLine('ការប្រាក់ក្នុងមួយខែ', `${money(monthlyCents(loan), loan.currency)} ${loan.interestMode === 'percent' ? `(${loan.rateBps / 100}%)` : '(ចំនួនថេរ)'}`)}
    ${receiptLine('ការប្រាក់ដល់ថ្ងៃបង់នៅសល់', money(interestDueAmount(loan, date), loan.currency))}
    ${interestPaid(loan) % monthlyCents(loan) && !loan.closedAt ? receiptLine('ការប្រាក់ខែបន្ទាប់នៅសល់', money(monthlyCents(loan) - interestPaid(loan) % monthlyCents(loan), loan.currency)) : ''}
    ${receiptLine('ថ្ងៃបង់បន្ទាប់', loan.closedAt ? 'កិច្ចសន្យាបានបញ្ចប់' : khDate(nextDue(loan)))}
    ${history.length ? `<h3>ប្រវត្តិបង់ប្រាក់</h3>${history.map(p => receiptLine(`${p.kind} · ${khDate(p.paidAt)}`, money(p.amountMinor, loan.currency))).join('')}` : ''}
    <div class="receipt-signatures"><span>ហត្ថលេខាអ្នកឱ្យខ្ចី<br>______________________</span><span>ហត្ថលេខាអតិថិជន<br>______________________</span></div>
    <p class="receipt-foot">បង្កាន់ដៃនេះបង្ហាញទិន្នន័យដែលបានកត់ត្រាក្នុងកម្មវិធីនៅថ្ងៃបោះពុម្ព។</p>`;
  $('receiptModal').hidden = false;
}
function closeReceipt() { $('receiptModal').hidden = true; }
let qrStream = null;
let qrFrame = 0;
let qrSession = 0;
let lastFrameAt = 0;
function stopQR() {
  qrSession++;
  cancelAnimationFrame(qrFrame);
  qrFrame = 0;
  qrStream?.getTracks().forEach(track => track.stop());
  qrStream = null;
  $('qrVideo').srcObject = null;
  $('qrVideo').hidden = false;
  $('qrPanel').hidden = true;
}
function detectedQR(raw) {
  const contact = telegramFromQR(raw);
  if (!contact) {
    $('qrStatus').textContent = 'QR នេះមិនមែនតំណគណនី Telegram ទេ។ សូមប្រើ QR ដែលមាន t.me/username ឬ t.me/+លេខទូរស័ព្ទ។';
    return false;
  }
  control($('loanForm'), 'telegram').value = contact.startsWith('+') ? contact : '@' + contact;
  stopQR();
  toast('បានបញ្ចូលគណនី Telegram ពី QR រួចរាល់។');
  return true;
}
function decodeQR(source, width, height) {
  if (typeof window.jsQR !== 'function') throw Error('មិនអាចបើកឧបករណ៍ស្កេន QR បានទេ។ សូមបញ្ចូលគណនី Telegram ដោយដៃ។');
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 1800 / Math.max(width, height));
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  return window.jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'attemptBoth' })?.data ?? null;
}
async function startQR() {
  stopQR();
  const session = qrSession;
  $('qrPanel').hidden = false;
  $('qrStatus').textContent = 'កំពុងបើកកាមេរ៉ា…';
  if (typeof window.jsQR !== 'function') {
    $('qrVideo').hidden = true;
    $('qrStatus').textContent = 'មិនអាចប្រើឧបករណ៍ស្កេន QR បានទេ។ សូមបញ្ចូលគណនីដោយដៃ។';
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    $('qrVideo').hidden = true;
    $('qrStatus').textContent = 'កាមេរ៉ាមិនអាចប្រើបាន។ អ្នកអាចជ្រើសរូបភាព QR ពីឧបករណ៍។';
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } });
    if (session !== qrSession || $('loanModal').hidden) { stream.getTracks().forEach(track => track.stop()); return; }
    qrStream = stream;
    const video = $('qrVideo');
    video.srcObject = stream;
    await video.play();
    if (session !== qrSession) return;
    $('qrStatus').textContent = 'ដាក់ QR របស់អតិថិជនក្នុងកាមេរ៉ា។';
    const scan = timestamp => {
      if (session !== qrSession || !qrStream) return;
      if (timestamp - lastFrameAt >= 180 && video.readyState >= 2 && video.videoWidth && video.videoHeight) {
        lastFrameAt = timestamp;
        try {
          const result = decodeQR(video, video.videoWidth, video.videoHeight);
          if (result && detectedQR(result)) return;
        } catch { $('qrStatus').textContent = 'មិនអាចស្កេនពីកាមេរ៉ាបានទេ។ សូមសាកល្បងរូបភាព QR។'; }
      }
      qrFrame = requestAnimationFrame(scan);
    };
    qrFrame = requestAnimationFrame(scan);
  } catch {
    if (session !== qrSession) return;
    qrStream?.getTracks().forEach(track => track.stop());
    qrStream = null;
    $('qrVideo').hidden = true;
    $('qrStatus').textContent = 'មិនអាចប្រើកាមេរ៉ាបាន។ សូមអនុញ្ញាតកាមេរ៉ា ឬជ្រើសរូបភាព QR។';
  }
}
$('scanTelegramQR').addEventListener('click', startQR);
$('stopTelegramQR').addEventListener('click', stopQR);
$('uploadTelegramQR').addEventListener('click', () => $('qrImage').click());
$('qrImage').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (!file.type.startsWith('image/') || file.size > 10_000_000) throw Error('សូមជ្រើសរូបភាព QR ទំហំក្រោម 10 MB។');
    let bitmap;
    let imageURL;
    if (typeof createImageBitmap === 'function') bitmap = await createImageBitmap(file);
    else {
      imageURL = URL.createObjectURL(file);
      bitmap = new Image();
      bitmap.src = imageURL;
      await bitmap.decode();
    }
    try {
      const result = decodeQR(bitmap, bitmap.width || bitmap.naturalWidth, bitmap.height || bitmap.naturalHeight);
      if (!result) throw Error('រកមិនឃើញ QR ក្នុងរូបភាពនេះទេ។ សូមសាកល្បងរូបភាពច្បាស់ជាងនេះ។');
      detectedQR(result);
    } finally { bitmap.close?.(); if (imageURL) URL.revokeObjectURL(imageURL); }
  } catch (error) {
    $('qrPanel').hidden = false;
    $('qrVideo').hidden = true;
    $('qrStatus').textContent = error.message || 'មិនអាចអានរូបភាព QR បានទេ។';
  } finally { event.target.value = ''; }
});
$('addLoan').addEventListener('click', () => openForm());
$('closeModal').addEventListener('click', closeForm);
$('cancelModal').addEventListener('click', closeForm);
$('loanModal').addEventListener('click', event => { if (event.target === $('loanModal')) closeForm(); });
for (const id of ['closePayment', 'cancelPayment']) $(id).addEventListener('click', closePayment);
$('paymentModal').addEventListener('click', event => { if (event.target === $('paymentModal')) closePayment(); });
for (const id of ['closeReceipt', 'cancelReceipt']) $(id).addEventListener('click', closeReceipt);
$('receiptModal').addEventListener('click', event => { if (event.target === $('receiptModal')) closeReceipt(); });
$('printReceipt').addEventListener('click', () => window.print());
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (!$('receiptModal').hidden) closeReceipt();
  else if (!$('paymentModal').hidden) closePayment();
  else if (!$('loanModal').hidden) closeForm();
});
$('paymentForm').addEventListener('change', event => {
  if (event.target === control($('paymentForm'), 'paymentType')) updatePaymentSummary(true);
});
$('paymentForm').addEventListener('input', event => {
  if (event.target === control($('paymentForm'), 'paymentAmount')) updatePaymentSummary();
});
$('paymentForm').addEventListener('submit', event => {
  event.preventDefault();
  const loan = loans.find(l => l.id === paymentLoanId);
  if (!loan || loan.closedAt) return;
  const form = event.currentTarget;
  const type = control(form, 'paymentType').value;
  const entered = Number(control(form, 'paymentAmount').value);
  const factor = loan.currency === 'USD' ? 100 : 1;
  const amountMinor = Math.round(entered * factor);
  const paidAt = control(form, 'paymentDate').value;
  if (!['interest', 'principal'].includes(type) || !Number.isFinite(entered) ||
      !Number.isSafeInteger(amountMinor) || amountMinor < 1 ||
      Math.abs(entered * factor - amountMinor) > 0.000001 ||
      amountMinor > paymentLimit(loan, type) ||
      !validDate(paidAt) || paidAt < loan.start || paidAt > todayKH()) {
    toast('សូមពិនិត្យប្រភេទ ចំនួនប្រាក់ និងថ្ងៃទទួលប្រាក់។');
    return;
  }
  const key = type === 'interest' ? 'payments' : 'principalPayments';
  try {
    const updated = normalizeLoan({ ...loan, [key]: [...loan[key], { id: crypto.randomUUID(), amountMinor, paidAt }] });
    if (commit(() => { loans = loans.map(l => l.id === loan.id ? updated : l); })) {
      closePayment();
      toast('បានកត់ត្រាការបង់ប្រាក់រួចរាល់។');
    }
  } catch (error) { toast(error.message); }
});
$('loanForm').addEventListener('input', previewInterest);
$('loanForm').addEventListener('change', event => {
  const form = $('loanForm');
  if (event.target === control(form, 'itemCategory')) {
    if (event.target.value !== 'gold' && control(form, 'isGold').disabled) control(form, 'isGold').checked = false;
    updateItemFields();
  }
  if (event.target === control(form, 'isGold')) updateItemFields();
});
$('loanForm').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  const previous = loans.find(l => l.id === editingId);
  const locked = previous && (previous.payments.length > 0 || previous.principalPayments.length > 0 || !!previous.closedAt);
  const raw = {
    id: previous?.id ?? crypto.randomUUID(),
    customer: control(form, 'customer').value,
    itemCategory: control(form, 'itemCategory').value,
    itemDetails: control(form, 'itemDetails').value,
    isGold: control(form, 'itemCategory').value === 'gold' || control(form, 'isGold').checked,
    goldWeightMilli: control(form, 'isGold').checked ? Math.round(Number(control(form, 'goldWeight').value) * 1000) : 0,
    goldUnit: control(form, 'isGold').checked ? control(form, 'goldUnit').value : null,
    itemCondition: control(form, 'itemCondition').value,
    storageLocation: control(form, 'storageLocation').value,
    serialNumber: control(form, 'serialNumber').value,
    telegram: control(form, 'telegram').value,
    phone: control(form, 'phone').value,
    notes: control(form, 'notes').value,
    currency: locked ? previous.currency : control(form, 'currency').value,
    interestMode: locked ? previous.interestMode : control(form, 'interestMode').value,
    amountMinor: locked ? previous.amountMinor : minor(control(form, 'amount').value, control(form, 'currency').value),
    rateBps: locked ? previous.rateBps : control(form, 'interestMode').value === 'percent' ? Math.round(Number(control(form, 'rate').value) * 100) : 0,
    fixedMinor: locked ? previous.fixedMinor : control(form, 'interestMode').value === 'fixed' ? minor(control(form, 'fixed').value, control(form, 'currency').value) : 0,
    start: locked ? previous.start : control(form, 'start').value,
    payments: previous?.payments ?? [],
    principalPayments: previous?.principalPayments ?? [],
    closedAt: previous?.closedAt ?? null
  };
  try {
    const loan = normalizeLoan(raw);
    if (commit(() => { loans = previous ? loans.map(l => l.id === previous.id ? loan : l) : [...loans, loan]; })) {
      closeForm();
      if (!previous) filter = 'active';
      toast(previous ? 'បានកែព័ត៌មានរួចរាល់។' : 'បានបន្ថែមការបញ្ចាំរួចរាល់។');
    }
  } catch (error) { toast(error.message); }
});
$('search').addEventListener('input', render);
$('itemFilter').addEventListener('change', render);
document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
  filter = button.dataset.filter;
  render();
}));
$('loanList').addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  if (button.dataset.action === 'new') { openForm(); return; }
  const loan = loans.find(l => l.id === button.dataset.id);
  if (!loan) return;
  switch (button.dataset.action) {
    case 'edit': openForm(loan); break;
    case 'receipt': openReceipt(loan); break;
    case 'pay': if (!loan.closedAt) openPayment(loan); break;
    case 'undo-interest':
    case 'undo-principal': {
      const key = button.dataset.action === 'undo-interest' ? 'payments' : 'principalPayments';
      if (!loan[key].length || loan.closedAt) return;
      if (!confirm('លុបការកត់ត្រាប្រាក់បានបង់ចុងក្រោយមែនទេ? ប្រើសម្រាប់កែការចុចខុសប៉ុណ្ណោះ។')) return;
      if (commit(() => loan[key].pop())) toast('បានកែការកត់ត្រាចុងក្រោយ។');
      break;
    }
    case 'close': {
      if (loan.closedAt) return;
      const due = interestDueAmount(loan);
      const principal = principalRemaining(loan);
      if (!confirm(`សូមបញ្ជាក់ថាបានទទួលប្រាក់ដើមនៅសល់ ${money(principal, loan.currency)} និងការប្រាក់ដល់ថ្ងៃបង់នៅសល់ ${money(due, loan.currency)} ហើយបានប្រគល់ទំនិញវិញ។\n\nកិច្ចសន្យានឹងកត់ត្រាចំនួននៅសល់ទាំងនេះជាការបង់ពេលបញ្ចប់។ បន្តឬ?`)) return;
      const paidAt = todayKH();
      const updated = normalizeLoan({ ...loan,
        payments: due ? [...loan.payments, { id: crypto.randomUUID(), amountMinor: due, paidAt }] : loan.payments,
        principalPayments: principal ? [...loan.principalPayments, { id: crypto.randomUUID(), amountMinor: principal, paidAt }] : loan.principalPayments,
        closedAt: paidAt });
      if (commit(() => { loans = loans.map(l => l.id === loan.id ? updated : l); })) toast('បានបញ្ចប់ការបញ្ចាំ និងកត់ត្រាប្រាក់នៅសល់។');
      break;
    }
  }
});
$('exportData').addEventListener('click', () => {
  try {
    const exportedAt = new Date().toISOString();
    const blob = new Blob([JSON.stringify({ version: 3, exportedAt, loans }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pawn-system-backup-${exportedAt.replace(/[:.]/g, '-')}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    const revokeTimer = setTimeout(() => URL.revokeObjectURL(url), 60_000);
    revokeTimer.unref?.();
    toast('ការទាញយកបានចាប់ផ្ដើម។ សូមពិនិត្យឯកសារក្នុង Files / Downloads។');
  } catch {
    toast('មិនអាចទាញយកបានទេ។ សូមសាកល្បងកម្មវិធីរុករកផ្សេង។');
  }
});
$('importData').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (file.size > 10_000_000) throw Error('ឯកសារធំពេក។');
    const parsed = JSON.parse(await file.text());
    const restored = importBackup(parsed);
    if (!confirm(`ឯកសារ «${file.name}» មាន ${restored.length} កិច្ចសន្យា។ ឧបករណ៍នេះមាន ${loans.length} កិច្ចសន្យា។\n\nការស្ដារនឹងជំនួសកំណត់ត្រាទាំងអស់នៅលើឧបករណ៍នេះ។ បើមានកំណត់ត្រាថ្មី សូមរក្សាទុកច្បាប់បម្រុងជាមុន។\n\nតើបន្តស្ដារឬទេ?`)) return;
    if (commit(() => { loans = restored; })) toast(`បានស្ដារ ${restored.length} កិច្ចសន្យារួចរាល់។`);
  } catch (error) { toast(error instanceof SyntaxError ? 'ឯកសារ JSON មិនត្រឹមត្រូវ។' : (error.message || 'មិនអាចស្ដារឯកសារនេះបានទេ។')); }
  finally { event.target.value = ''; }
});
window.addEventListener('storage', event => { if (event.key === STORAGE_KEY) { load(); render(); } });
window.addEventListener('focus', render);
load();
render();
setInterval(render, 60_000);
