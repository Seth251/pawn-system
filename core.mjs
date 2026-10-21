export const STORAGE_KEY = 'pawn-kh-v1';
export const MAX_CENTS = 10_000_000_000;
export const MAX_RIEL = 1_000_000_000_000;
export const ITEM_CATEGORIES = Object.freeze({
  gold: 'មាស', necklace: 'ខ្សែក', ring: 'ចិញ្ចៀន', bracelet: 'ខ្សែដៃ',
  earrings: 'ក្រវិល', pendant: 'បន្តោងខ្សែក', watch: 'នាឡិកា',
  phone: 'ទូរស័ព្ទ', motorcycle: 'ម៉ូតូ', computer: 'កុំព្យូទ័រ', other: 'ផ្សេងៗ'
});
export const GOLD_UNITS = Object.freeze({ g: 'ក្រាម', chi: 'ជី', damlung: 'តម្លឹង' });
export function goldWeightText(loan) {
  if (!loan.isGold || !loan.goldWeightMilli) return '';
  return `${(loan.goldWeightMilli / 1000).toLocaleString('en-US', { maximumFractionDigits: 3 })} ${GOLD_UNITS[loan.goldUnit]}`;
}

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
  if (loan.interestMode === 'fixed') return loan.fixedMinor;
  return Math.round((loan.amountMinor ?? loan.amountCents) * loan.rateBps / 10000);
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
export function money(amount, currency = 'USD') {
  return currency === 'KHR' ? '៛' + amount.toLocaleString('en-US') : '$' + (amount / 100).toFixed(2);
}
export function khDate(value) {
  if (!validDate(value)) return value;
  return new Intl.DateTimeFormat('km-KH', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(`${value}T12:00:00Z`));
}
export function normalizeTelegram(value) {
  let contact = String(value ?? '').trim();
  if (!contact) return '';
  if (/^tg:\/\/resolve\?/i.test(contact)) {
    const url = new URL(contact);
    const phone = url.searchParams.get('phone');
    contact = url.searchParams.get('domain') ?? (phone ? '+' + phone.replace(/\D/g, '') : '');
  } else if (/^https?:\/\//i.test(contact)) {
    let url;
    try { url = new URL(contact); } catch { return null; }
    if (!['t.me', 'telegram.me', 'www.t.me', 'www.telegram.me'].includes(url.hostname.toLowerCase())) return null;
    try { contact = decodeURIComponent(url.pathname.replace(/^\//, '').replace(/\/$/, '')); }
    catch { return null; }
  }
  contact = contact.replace(/^@/, '');
  if (/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(contact)) return contact;
  if (/^\+[1-9]\d{6,14}$/.test(contact)) return contact;
  return null;
}
export function telegramFromQR(value) {
  const raw = String(value ?? '').trim();
  if (!/^(@|https?:\/\/|tg:\/\/)/i.test(raw)) return null;
  return normalizeTelegram(raw);
}
export function reminder(loan, date = todayKH()) {
  const count = unpaidMonths(loan, date);
  const currency = loan.currency ?? 'USD';
  const extra = count > 1 ? ` បច្ចុប្បន្នមានការប្រាក់មិនទាន់កត់ត្រា ${count} ខែ សរុប ${money(count * monthlyCents(loan), currency)}។` : '';
  return `សួស្តី ${loan.customer} សូមរំលឹកថា ការប្រាក់ចំនួន ${money(monthlyCents(loan), currency)} សម្រាប់ ${loan.item} ត្រូវបង់នៅថ្ងៃទី ${khDate(nextDue(loan))}។${extra} សូមទាក់ទងមកយើងខ្ញុំដើម្បីរៀបចំការបង់ប្រាក់។ សូមអរគុណ។`;
}
export function telegramURL(loan, date = todayKH()) {
  const username = normalizeTelegram(loan.telegram);
  if (!username) return null;
  return `https://t.me/${username}?text=${encodeURIComponent(reminder(loan, date))}`;
}
export function normalizeLoan(raw, date = todayKH()) {
  if (!raw || typeof raw !== 'object') throw Error('ព័ត៌មានការបញ្ចាំមិនត្រឹមត្រូវ');
  const customer = String(raw.customer ?? '').trim();
  const itemCategory = raw.itemCategory ?? 'other';
  const itemDetails = String(raw.itemDetails ?? (raw.itemCategory ? '' : raw.item ?? '')).trim();
  const item = itemCategory === 'other' ? itemDetails :
    `${ITEM_CATEGORIES[itemCategory] ?? ''}${itemDetails ? ' · ' + itemDetails : ''}`;
  const isGold = raw.isGold === true || itemCategory === 'gold';
  const goldWeightMilli = Number(raw.goldWeightMilli ?? 0);
  const goldUnit = raw.goldUnit ?? null;
  const telegram = normalizeTelegram(raw.telegram);
  const phone = String(raw.phone ?? '').trim();
  const notes = String(raw.notes ?? '').trim();
  const currency = raw.currency ?? 'USD';
  const interestMode = raw.interestMode ?? 'percent';
  const amountMinor = Number(raw.amountMinor ?? raw.amountCents);
  const rateBps = Number(raw.rateBps ?? 0);
  const fixedMinor = Number(raw.fixedMinor ?? 0);
  if (!customer || customer.length > 100 || !Object.hasOwn(ITEM_CATEGORIES, itemCategory) ||
      itemDetails.length > 200 || !item || item.length > 200 ||
      (raw.isGold !== undefined && typeof raw.isGold !== 'boolean') ||
      !Number.isSafeInteger(goldWeightMilli) ||
      (isGold ? goldWeightMilli < 1 || goldWeightMilli > 1_000_000_000 || !Object.hasOwn(GOLD_UNITS, goldUnit)
        : goldWeightMilli !== 0 || goldUnit !== null) ||
      telegram === null || phone.length > 40 || notes.length > 500 ||
      !['USD', 'KHR'].includes(currency) || !['percent', 'fixed'].includes(interestMode) ||
      !Number.isSafeInteger(amountMinor) || amountMinor < 1 || amountMinor > (currency === 'KHR' ? MAX_RIEL : MAX_CENTS) ||
      !Number.isInteger(rateBps) || (interestMode === 'percent' ? rateBps < 1 || rateBps > 10000 : rateBps !== 0) ||
      !Number.isSafeInteger(fixedMinor) || (interestMode === 'fixed' ? fixedMinor < 1 || fixedMinor > (currency === 'KHR' ? MAX_RIEL : MAX_CENTS) : fixedMinor !== 0) ||
      !validDate(raw.start) || raw.start < '2000-01-01' || raw.start > date) {
    throw Error('សូមពិនិត្យឈ្មោះ ប្រភេទទំនិញ ទម្ងន់មាស ប្រាក់ ថ្ងៃ និងព័ត៌មាន Telegram។');
  }
  if (interestMode === 'percent' && Math.round(amountMinor * rateBps / 10000) < 1) {
    throw Error('ការប្រាក់ប្រចាំខែតិចជាងចំនួនប្រាក់តូចបំផុត។ សូមបង្កើនភាគរយ ឬជ្រើសចំនួនថេរ។');
  }
  const payments = raw.payments ?? [];
  if (!Array.isArray(payments) || payments.length > 1199) throw Error('ប្រវត្តិបង់ប្រាក់មិនត្រឹមត្រូវ');
  const normalizedPayments = payments.map((p, index) => {
    const paidMinor = p?.amountMinor ?? p?.amountCents;
    const monthly = interestMode === 'fixed' ? fixedMinor : Math.round(amountMinor * rateBps / 10000);
    if (!p || p.period !== index + 1 || paidMinor !== monthly ||
        !validDate(p.paidAt) || p.paidAt > date || typeof p.id !== 'string' || p.id.length > 100) {
      throw Error('ប្រវត្តិបង់ប្រាក់មិនត្រឹមត្រូវ');
    }
    return { id: p.id, period: p.period, amountMinor: paidMinor, paidAt: p.paidAt };
  });
  const closedAt = raw.closedAt ?? null;
  if (closedAt !== null && (!validDate(closedAt) || closedAt > date)) throw Error('ថ្ងៃបញ្ចប់មិនត្រឹមត្រូវ');
  return { id: typeof raw.id === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(raw.id) ? raw.id : crypto.randomUUID(),
    customer, item, itemCategory, itemDetails, isGold, goldWeightMilli, goldUnit,
    telegram, phone, notes, currency, interestMode, amountMinor, rateBps, fixedMinor,
    start: raw.start, payments: normalizedPayments, closedAt };
}

export function importBackup(parsed, date = todayKH()) {
  if (!parsed || !Array.isArray(parsed.loans) ||
      !([1, 2].includes(parsed.version) || (parsed.version === undefined && typeof parsed.exported === 'string'))) {
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
