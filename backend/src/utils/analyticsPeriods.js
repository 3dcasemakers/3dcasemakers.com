// Calendar ranges use the store's India timezone, independent of the Node host.
const DAY_MS = 86400000;
const IST_OFFSET_MS = 19800000;

function storeDate(now = new Date()) {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function addDays(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function monthsBefore(date, months) {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d.toISOString().slice(0, 10);
}

const PERIOD_KEYS = new Set(["today", "yesterday", "last_7_days", "this_week", "last_week", "this_month", "last_month", "last_3_months", "last_6_months", "this_year", "last_1_year", "all_time"]);

function periodRange(key, now = new Date()) {
  const today = storeDate(now);
  const tomorrow = addDays(today, 1);
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const monday = addDays(today, -((weekday + 6) % 7));
  const monthStart = `${today.slice(0, 7)}-01`;
  let start = today;
  let end = tomorrow;
  switch (key) {
    case "yesterday": start = addDays(today, -1); end = today; break;
    case "last_7_days": start = addDays(today, -6); break;
    case "this_week": start = monday; break;
    case "last_week": start = addDays(monday, -7); end = monday; break;
    case "this_month": start = monthStart; break;
    case "last_month": start = monthsBefore(monthStart, 1); end = monthStart; break;
    case "last_3_months": start = monthsBefore(today, 3); break;
    case "last_6_months": start = monthsBefore(today, 6); break;
    case "this_year": start = `${today.slice(0, 4)}-01-01`; break;
    case "last_1_year": start = monthsBefore(today, 12); break;
    case "all_time": start = null; break;
  }
  return {
    start,
    end,
    // Both values are internally generated ISO dates; never interpolate request input.
    where: start ? `created_at >= '${start}' AND created_at < '${end}'` : `created_at < '${end}'`,
  };
}

function zeroFillDates(rows, start, end) {
  const byDay = new Map(rows.map((r) => [String(r.day).slice(0, 10), { revenue: Number(r.revenue) || 0, orders: Number(r.orders) || 0 }]));
  const first = start || [...byDay.keys()].sort()[0] || addDays(end, -1);
  const out = [];
  for (let day = first; day < end; day = addDays(day, 1)) {
    out.push({ day, ...(byDay.get(day) || { revenue: 0, orders: 0 }) });
  }
  return out;
}

function parseItems(value) {
  try {
    const items = typeof value === "string" ? JSON.parse(value || "[]") : value;
    return Array.isArray(items) ? items.filter((i) => i && typeof i === "object") : [];
  } catch { return []; }
}

function itemQuantity(item) {
  const n = Number(item.quantity ?? 1);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function orderDiscount(order) {
  return Math.max(0, Math.round(((Number(order.subtotal) || 0) + (Number(order.shipping) || 0) - (Number(order.total) || 0)) * 100) / 100);
}

function reportRange(months, now = new Date()) {
  const today = storeDate(now);
  const monthStart = `${today.slice(0, 7)}-01`;
  const count = [3, 6, 12].includes(Number(months)) ? Number(months) : 12;
  const start = monthsBefore(monthStart, count - 1);
  const end = addDays(today, 1);
  return { months: count, start, end, historyStart: monthsBefore(monthStart, 23), where: `created_at >= '${start}' AND created_at < '${end}'` };
}

function zeroFillMonths(rows, start, end) {
  const map = new Map(rows.map((r) => [r.month, r]));
  const result = [];
  const current = new Date(`${start}T00:00:00Z`);
  while (current.toISOString().slice(0, 10) < end) {
    const month = current.toISOString().slice(0, 7);
    const row = map.get(month) || {};
    result.push({ month, revenue: Number(row.revenue) || 0, orders: Number(row.orders) || 0, grossSales: Number(row.grossSales) || 0, totalShipping: Number(row.totalShipping) || 0 });
    current.setUTCMonth(current.getUTCMonth() + 1);
  }
  return result;
}

module.exports = { storeDate, addDays, periodRange, PERIOD_KEYS, zeroFillDates, parseItems, itemQuantity, orderDiscount, reportRange, zeroFillMonths };
