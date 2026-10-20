import { STORAGE_KEY, todayKH, dueDate, monthlyCents, nextDue, unpaidMonths,
  status, money, khDate, normalizeLoan, telegramURL, importBackup, telegramFromQR } from './core.mjs';

const $ = id => document.getElementById(id);
const control = (form, name) => form.elements.namedItem(name);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[c]);
const labels = { overdue: 'ហួសថ្ងៃបង់', today: 'ដល់ថ្ងៃបង់', soon: 'ជិតដល់ថ្ងៃបង់', upcoming: 'មិនទាន់ដល់ថ្ងៃ', closed: 'បានបញ្ចប់' };
let loans = [];
let filter = 'active';
let editingId = null;
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
    if (stored.version !== 1 || !Array.isArray(stored.loans)) throw Error('Invalid data');
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, loans }));
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
  const active = loans.filter(l => !l.closedAt);
  const alerts = active.filter(l => ['overdue', 'today'].includes(status(l, date)));
  const overdue = alerts.filter(l => status(l, date) === 'overdue').length;
  $('headerDate').textContent = khDate(date);
  $('principalValue').textContent = money(active.reduce((sum, l) => sum + l.amountCents, 0));
  $('interestValue').textContent = money(active.reduce((sum, l) => sum + unpaidMonths(l, date) * monthlyCents(l), 0));
  $('activeValue').textContent = `${active.length} កិច្ចសន្យាកំពុងដំណើរការ`;
  $('reminderValue').textContent = `${alerts.length} នាក់`;
  $('overdueValue').textContent = `${overdue} ហួសថ្ងៃ · ${alerts.length - overdue} ដល់ថ្ងៃ`;
  $('navAlert').textContent = String(alerts.length);
  $('tabAlert').textContent = String(alerts.length);
  $('recordCount').textContent = String(loans.length);
  $('notice').classList.toggle('needs-action', alerts.length > 0);
  $('notice').innerHTML = alerts.length
    ? `<span class="notice-icon">♧</span><div><strong>មានអតិថិជន ${alerts.length} នាក់ត្រូវរំលឹក</strong><p>ការប្រាក់ដល់ថ្ងៃបង់ ឬហួសថ្ងៃបង់ហើយ។ ចុច Telegram ដើម្បីបើកសាររំលឹក។</p></div>`
    : `<span class="notice-icon">✓</span><div><strong>មិនមានអតិថិជនត្រូវរំលឹកថ្ងៃនេះទេ</strong><p>ការជូនដំណឹងធ្វើបច្ចុប្បន្នភាពពេលអ្នកបើកកម្មវិធី។</p></div>`;
  document.querySelectorAll('[data-filter]').forEach(button => {
    button.classList.toggle('active', button.dataset.filter === filter);
    button.classList.toggle('selected', button.dataset.filter === filter);
  });
  const query = $('search').value.trim().toLocaleLowerCase();
  const shown = loans.filter(l => {
    if (filter === 'closed') return !!l.closedAt;
    if (l.closedAt) return false;
    if (filter === 'alert') return ['overdue', 'today'].includes(status(l, date));
    return true;
  }).filter(l => [l.customer, l.item, l.telegram, l.phone, l.notes]
    .join(' ').toLocaleLowerCase().includes(query))
    .sort((a, b) => (a.closedAt ? a.closedAt : nextDue(a)).localeCompare(b.closedAt ? b.closedAt : nextDue(b)));
  $('loanList').innerHTML = shown.length ? shown.map(l => row(l, date)).join('') :
    `<div class="empty"><span class="empty-symbol">◈</span><strong>${loans.length ? 'មិនមានការបញ្ចាំក្នុងបញ្ជីនេះទេ' : 'ចាប់ផ្ដើមកត់ត្រាការបញ្ចាំដំបូង'}</strong><p>${loans.length ? 'សាកល្បងពាក្យស្វែងរក ឬជ្រើសផ្ទាំងផ្សេង។' : 'បន្ថែមអតិថិជន ទំនិញ និងប្រាក់ដែលបានឱ្យខ្ចី។ កម្មវិធីនឹងគណនាថ្ងៃបង់រៀងរាល់ខែ។'}</p>${loans.length ? '' : '<button class="button primary" data-action="new">＋ បន្ថែមការបញ្ចាំ</button>'}</div>`;
}
function row(l, date) {
  const state = status(l, date);
  const missed = unpaidMonths(l, date);
  const history = l.payments.length ? l.payments.map(p => `<div class="history-line"><span>ខែទី ${p.period} · កំណត់បង់ ${khDate(dueDate(l.start, p.period))}</span><span>${money(p.amountCents)} · បានបង់ ${khDate(p.paidAt)}</span></div>`).join('') : '<p>មិនទាន់មានការបង់ការប្រាក់ដែលបានកត់ត្រាទេ។</p>';
  const tg = !l.closedAt ? telegramURL(l, date) : null;
  return `<article class="loan-row">
    <div class="person"><span class="initial">${escapeHTML(l.customer.slice(0, 1))}</span><span><strong>${escapeHTML(l.customer)}</strong><small>${escapeHTML(l.item)}</small><em>${l.telegram.startsWith('+') ? '' : '@'}${escapeHTML(l.telegram)}</em></span></div>
    <div class="loan-number"><strong>${money(l.amountCents)}</strong><small>${money(monthlyCents(l))} / ខែ · ${l.rateBps / 100}%</small></div>
    <div><span class="due-text">${l.closedAt ? 'បិទនៅ ' + khDate(l.closedAt) : khDate(nextDue(l))}</span><span class="badge ${state}">${labels[state]}</span>${missed > 1 ? `<span class="missed">មិនទាន់បង់ ${missed} ខែ</span>` : ''}</div>
    <div class="row-actions">${tg ? `<a class="telegram" href="${escapeHTML(tg)}" target="_blank" rel="noopener noreferrer">✉ បើក Telegram ↗</a>` : ''}${!l.closedAt ? `<button class="action-small" data-action="pay" data-id="${escapeHTML(l.id)}">✓ កត់ត្រាប្រាក់បានបង់</button>` : ''}<button class="action-small" data-action="edit" data-id="${escapeHTML(l.id)}">កែព័ត៌មាន</button>${!l.closedAt ? `<button class="action-small close" data-action="close" data-id="${escapeHTML(l.id)}">បញ្ចប់ការបញ្ចាំ</button>` : ''}</div>
    <details class="row-details"><summary>ព័ត៌មានបន្ថែម និងប្រវត្តិបង់ប្រាក់</summary><p>ថ្ងៃឱ្យខ្ចី៖ ${khDate(l.start)}${l.phone ? ` · ទូរស័ព្ទ៖ ${escapeHTML(l.phone)}` : ''}</p>${l.notes ? `<p>កំណត់ចំណាំ៖ ${escapeHTML(l.notes)}</p>` : ''}${history}${l.payments.length && !l.closedAt ? `<button class="action-small close" data-action="undo" data-id="${escapeHTML(l.id)}">កែការកត់ត្រាចុងក្រោយ</button>` : ''}</details>
  </article>`;
}
function previewInterest() {
  const form = $('loanForm');
  const amount = Math.round(Number(control(form, 'amount').value) * 100);
  const bps = Math.round(Number(control(form, 'rate').value) * 100);
  $('interestPreview').textContent = amount > 0 && bps > 0
    ? `ការប្រាក់ប្រចាំខែ៖ ${money(Math.round(amount * bps / 10000))} (ប្រាក់ដើម ${money(amount)} × ${bps / 100}%)`
    : 'បើឱ្យខ្ចី $100 ក្នុងអត្រា 3% ការប្រាក់គឺ $3 ក្នុងមួយខែ។';
}
function openForm(loan = null) {
  stopQR();
  editingId = loan?.id ?? null;
  const form = $('loanForm');
  form.reset();
  $('modalTitle').textContent = loan ? 'កែព័ត៌មានការបញ្ចាំ' : 'បន្ថែមការបញ្ចាំ';
  control(form, 'customer').value = loan?.customer ?? '';
  control(form, 'item').value = loan?.item ?? '';
  control(form, 'amount').value = loan ? (loan.amountCents / 100).toFixed(2) : '';
  control(form, 'rate').value = loan ? loan.rateBps / 100 : 3;
  control(form, 'start').value = loan?.start ?? todayKH();
  control(form, 'start').max = todayKH();
  control(form, 'telegram').value = loan ? (loan.telegram.startsWith('+') ? loan.telegram : '@' + loan.telegram) : '';
  control(form, 'phone').value = loan?.phone ?? '';
  control(form, 'notes').value = loan?.notes ?? '';
  const locked = !!loan && (loan.payments.length > 0 || !!loan.closedAt);
  for (const field of ['amount', 'rate', 'start']) control(form, field).disabled = locked;
  $('lockedTerms').hidden = !locked;
  previewInterest();
  $('loanModal').hidden = false;
  control(form, 'customer').focus();
}
function closeForm() { stopQR(); $('loanModal').hidden = true; editingId = null; }
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
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('loanModal').hidden) closeForm(); });
$('loanForm').addEventListener('input', previewInterest);
$('loanForm').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  const previous = loans.find(l => l.id === editingId);
  const locked = previous && (previous.payments.length > 0 || !!previous.closedAt);
  const raw = {
    id: previous?.id ?? crypto.randomUUID(),
    customer: control(form, 'customer').value,
    item: control(form, 'item').value,
    telegram: control(form, 'telegram').value,
    phone: control(form, 'phone').value,
    notes: control(form, 'notes').value,
    amountCents: locked ? previous.amountCents : Math.round(Number(control(form, 'amount').value) * 100),
    rateBps: locked ? previous.rateBps : Math.round(Number(control(form, 'rate').value) * 100),
    start: locked ? previous.start : control(form, 'start').value,
    payments: previous?.payments ?? [],
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
    case 'pay': {
      if (loan.closedAt) return;
      const due = nextDue(loan);
      if (!confirm(`តើអ្នកបានទទួលការប្រាក់ ${money(monthlyCents(loan))} សម្រាប់ខែដែលកំណត់បង់នៅថ្ងៃទី ${khDate(due)} ពិតប្រាកដហើយឬនៅ?\n\nការកត់ត្រានេះបង់បានមួយខែ ហើយប្រាក់ដើម ${money(loan.amountCents)} នៅដដែល។`)) return;
      if (commit(() => loan.payments.push({ id: crypto.randomUUID(), period: loan.payments.length + 1, amountCents: monthlyCents(loan), paidAt: todayKH() }))) toast('បានកត់ត្រាការបង់ការប្រាក់មួយខែ។');
      break;
    }
    case 'undo': {
      if (!loan.payments.length || loan.closedAt) return;
      if (!confirm('លុបការកត់ត្រាការបង់ការប្រាក់ចុងក្រោយមែនទេ? ប្រើសម្រាប់កែការចុចខុសប៉ុណ្ណោះ។')) return;
      if (commit(() => loan.payments.pop())) toast('បានកែការកត់ត្រាចុងក្រោយ។');
      break;
    }
    case 'close': {
      if (loan.closedAt) return;
      const due = unpaidMonths(loan) * monthlyCents(loan);
      if (!confirm(`សូមបញ្ជាក់ថា អតិថិជនបានសងប្រាក់ដើម ${money(loan.amountCents)} និងការប្រាក់នៅសល់ ${money(due)} រួចរាល់ ហើយបានទទួលទំនិញវិញ។\n\nបញ្ចប់ការបញ្ចាំនេះឬ?`)) return;
      if (commit(() => { loan.closedAt = todayKH(); })) toast('បានបញ្ចប់ការបញ្ចាំ ហើយការរំលឹកត្រូវបានបិទ។');
      break;
    }
  }
});
$('exportData').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), loans }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `pawn-system-backup-${todayKH()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('បានទាញយកឯកសារបម្រុងទុក។');
});
$('importData').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (file.size > 10_000_000) throw Error('ឯកសារធំពេក។');
    const parsed = JSON.parse(await file.text());
    const restored = importBackup(parsed);
    if (!confirm('ការស្ដារនឹងជំនួសទិន្នន័យបច្ចុប្បន្នលើឧបករណ៍នេះ។ សូមទាញយកឯកសារបម្រុងទុកមុនបន្ត។ បន្តឬ?')) return;
    if (commit(() => { loans = restored; })) toast('បានស្ដារទិន្នន័យរួចរាល់។');
  } catch (error) { toast(error.message || 'មិនអាចស្ដារឯកសារនេះបានទេ។'); }
  finally { event.target.value = ''; }
});
window.addEventListener('storage', event => { if (event.key === STORAGE_KEY) { load(); render(); } });
window.addEventListener('focus', render);
load();
render();
setInterval(render, 60_000);
