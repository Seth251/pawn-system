export const STORAGE_KEY = 'pawn-kh-v1';
export const MAX_CENTS = 10_000_000_000;

export function todayKH(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Phnom_Penh', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const get = type => parts.find(part => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function dueDate(start, period) {
  if (!validDate(start) || !Number.isInteger(period) || period < 0 || period > 1200) throw Error('Invalid date or period');
  const [year, month, day] = start.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1 + period, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(day, last));
  return first.toISOString().slice(0, 10);
}

export function monthlyCents(loan) {
  return Math.round(loan.amountCents * loan.rateBps / 10000);
}
export function nextDue(loan) { return dueDate(loan.start, loan.payments.length + 1); }
export function unpaidMonths(loan, date = todayKH()) {
  if (loan.closedAt) return 0;
  let count = 0;
  while (loan.payments.length + count < 1200 && dueDate(loan.start, loan.payments.length + count + 1) <= date) count++;
  return count;
}
export function status(loan, date = todayKH()) {
  if (loan.closedAt) return 'closed';
  const due = nextDue(loan);
  if (due < date) return 'overdue';
  if (due === date) return 'today';
  return (Date.parse(due) - Date.parse(date)) / 86400000 <= 3 ? 'soon' : 'upcoming';
}
export function money(cents) { return '$' + (cents / 100).toFixed(2); }
export function khDate(value) {
  if (!validDate(value)) return value;
  return new Intl.DateTimeFormat('km-KH', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(`${value}T12:00:00Z`));
}
export function normalizeTelegram(value) {
  const username = String(value ?? '').trim().replace(/^@/, '').replace(/^https?:\/\/(?:www\.)?t\.me\//i, '').replace(/\/$/, '');
  return /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username) ? username : null;
}
export function reminder(loan, date = todayKH()) {
  const count = unpaidMonths(loan, date);
  const extra = count > 1 ? ` បច្ចុប្បន្នមានការប្រាក់មិនទាន់កត់ត្រា ${count} ខែ សរុប ${money(count * monthlyCents(loan))}។` : '';
  return `សួស្តី ${loan.customer} សូមរំលឹកថា ការប្រាក់ចំនួន ${money(monthlyCents(loan))} សម្រាប់ ${loan.item} ត្រូវបង់នៅថ្ងៃទី ${khDate(nextDue(loan))}។${extra} សូមទាក់ទងមកយើងខ្ញុំដើម្បីរៀបចំការបង់ប្រាក់។ សូមអរគុណ។`;
}
export function telegramURL(loan, date = todayKH()) {
  const username = normalizeTelegram(loan.telegram);
  if (!username) return null;
  return `https://t.me/${username}?text=${encodeURIComponent(reminder(loan, date))}`;
}
export function normalizeLoan(raw, date = todayKH()) {
  if (!raw || typeof raw !== 'object') throw Error('ព័ត៌មានការបញ្ចាំមិនត្រឹមត្រូវ');
  const customer = String(raw.customer ?? '').trim();
  const item = String(raw.item ?? '').trim();
  const telegram = normalizeTelegram(raw.telegram);
  const phone = String(raw.phone ?? '').trim();
  const notes = String(raw.notes ?? '').trim();
  const amountCents = Number(raw.amountCents);
  const rateBps = Number(raw.rateBps);
  if (!customer || customer.length > 100 || !item || item.length > 200 || !telegram || phone.length > 40 || notes.length > 500 ||
      !Number.isSafeInteger(amountCents) || amountCents < 1 || amountCents > MAX_CENTS ||
      !Number.isInteger(rateBps) || rateBps < 1 || rateBps > 10000 ||
      !validDate(raw.start) || raw.start < '2000-01-01' || raw.start > date) {
    throw Error('សូមពិនិត្យឈ្មោះ ទំនិញ ចំនួនប្រាក់ ថ្ងៃឱ្យខ្ចី អត្រាការប្រាក់ និង Telegram');
  }
  const payments = raw.payments ?? [];
  if (!Array.isArray(payments) || payments.length > 1199) throw Error('ប្រវត្តិបង់ប្រាក់មិនត្រឹមត្រូវ');
  const normalizedPayments = payments.map((p, index) => {
    if (!p || p.period !== index + 1 || p.amountCents !== Math.round(amountCents * rateBps / 10000) ||
        !validDate(p.paidAt) || p.paidAt > date || typeof p.id !== 'string' || p.id.length > 100) {
      throw Error('ប្រវត្តិបង់ប្រាក់មិនត្រឹមត្រូវ');
    }
    return { id: p.id, period: p.period, amountCents: p.amountCents, paidAt: p.paidAt };
  });
  const closedAt = raw.closedAt ?? null;
  if (closedAt !== null && (!validDate(closedAt) || closedAt > date)) throw Error('ថ្ងៃបញ្ចប់មិនត្រឹមត្រូវ');
  return { id: typeof raw.id === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(raw.id) ? raw.id : crypto.randomUUID(),
    customer, item, telegram, phone, notes, amountCents, rateBps, start: raw.start, payments: normalizedPayments, closedAt };
}

export function importBackup(parsed, date = todayKH()) {
  if (!parsed || !Array.isArray(parsed.loans) ||
      !(parsed.version === 1 || (parsed.version === undefined && typeof parsed.exported === 'string'))) {
    throw Error('ទម្រង់ឯកសារមិនត្រឹមត្រូវ។');
  }
  const legacy = parsed.version === undefined;
  const records = parsed.loans.map(raw => normalizeLoan(legacy ? {
    ...raw,
    payments: (raw.payments ?? []).map(p => ({ ...p, paidAt: p.date })),
    closedAt: raw.closed ? (raw.closedDate ?? date) : null
  } : raw, date));
  if (new Set(records.map(l => l.id)).size !== records.length) throw Error('មានកិច្ចសន្យាស្ទួនគ្នា។');
  return records;
}
