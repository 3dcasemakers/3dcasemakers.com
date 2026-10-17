import type ExcelJS from "exceljs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// Brand colour used for header bands across the styled (ExcelJS) exports —
// keep in sync with the site's dark admin accent (#202223).
const HEADER_FILL = "FF202223";
const HEADER_FONT = "FFFFFFFF";
const BORDER_COLOR = "FFD9D9D9";
const ZEBRA_FILL = "FFF6F6F7";

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: BORDER_COLOR } },
  left: { style: "thin", color: { argb: BORDER_COLOR } },
  bottom: { style: "thin", color: { argb: BORDER_COLOR } },
  right: { style: "thin", color: { argb: BORDER_COLOR } },
};

// Triggers a browser download for an in-memory ExcelJS workbook — ExcelJS
// only builds a buffer, it doesn't write to disk like SheetJS's writeFile.
async function downloadWorkbook(wb: ExcelJS.Workbook, filename: string) {
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([new Uint8Array(buffer)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Period keys shared between the report period selector and the
// /api/analytics/export-data backend endpoint — keep in sync with
// PERIOD_RANGES / PERIOD_LABELS in backend/src/routes/analytics.js.
export const REPORT_PERIODS: { key: string; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "last_7_days", label: "Last 7 Days" },
  { key: "this_month", label: "This Month" },
  { key: "last_month", label: "Last Month" },
  { key: "last_3_months", label: "Last 3 Months" },
  { key: "this_year", label: "This Year" },
  { key: "all_time", label: "All Time" },
];

export interface ExportSummary {
  periodKey: string;
  periodLabel: string;
  totalOrders: number;
  cancelledOrders: number;
  returnedOrders?: number;
  totalRevenue: number;
  avgOrderValue: number;
  uniqueCustomers: number;
  generatedAt: string;
}
export interface ExportSalesRow {
  id: string;
  date: string;
  customerName: string;
  customerPhone: string;
  city: string;
  state: string;
  itemsCount: number;
  subtotal: number;
  shipping: number;
  discount: number;
  total: number;
  paymentMethod: string;
  status: string;
}
export interface ExportCustomerRow {
  phone: string;
  name: string;
  email: string;
  city: string;
  state: string;
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string;
}
export interface ExportData {
  summary: ExportSummary;
  salesRows: ExportSalesRow[];
  customerRows: ExportCustomerRow[];
}

const fmtDate = (iso: string) => {
  const d = new Date(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:/.test(iso) && !/(Z|[+-]\d{2}:?\d{2})$/.test(iso) ? iso.replace(" ", "T") + "+05:30" : iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
};
const fmtDateTime = (iso: string) => {
  const d = new Date(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:/.test(iso) && !/(Z|[+-]\d{2}:?\d{2})$/.test(iso) ? iso.replace(" ", "T") + "+05:30" : iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
};
const fileSlug = (periodLabel: string) => `${periodLabel.toLowerCase().replace(/\s+/g, "-")}-${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date())}`;

// ---------------- Excel (.xlsx) exports ----------------

function reportSheet(wb: ExcelJS.Workbook, name: string, rows: (string | number)[][]) {
  const sheet = wb.addWorksheet(name);
  sheet.addRows(rows);
  sheet.columns.forEach((column, index) => { column.width = index === 0 ? 28 : 22; });
  sheet.getRow(1).font = { bold: true, color: { argb: HEADER_FONT } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.eachRow((row, index) => {
    row.eachCell((cell) => {
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.border = thinBorder;
      if (index > 1 && index % 2 === 0) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA_FILL } };
    });
  });
  return sheet;
}

export async function exportSalesExcel(data: ExportData) {
  const { summary, salesRows } = data;
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  reportSheet(wb, "Summary", [
    ["3D Case Makers — Sales Report"],
    ["Period", summary.periodLabel], ["Generated", fmtDateTime(summary.generatedAt)],
    ["Basis", "Placed order value after discounts and shipping; excludes cancelled/returned orders."], [],
    ["Total Orders", summary.totalOrders], ["Cancelled Orders", summary.cancelledOrders], ["Returned Orders", summary.returnedOrders || 0],
    ["Booked Order Value (₹)", summary.totalRevenue],
    ["Average Order Value (₹)", Math.round(summary.avgOrderValue)],
    ["Unique Customers", summary.uniqueCustomers],
  ]);
  reportSheet(wb, "Orders", [
    ["Order ID", "Date", "Customer", "Phone", "City", "State", "Items", "Subtotal (₹)", "Shipping (₹)", "Discount (₹)", "Total (₹)", "Payment", "Status"],
    ...salesRows.map((r) => [r.id, fmtDate(r.date), r.customerName, r.customerPhone, r.city, r.state, r.itemsCount, r.subtotal, r.shipping, r.discount, r.total, r.paymentMethod.toUpperCase(), r.status]),
  ]);
  await downloadWorkbook(wb, `3dcasemakers-sales-report-${fileSlug(summary.periodLabel)}.xlsx`);
}

export async function exportCustomerExcel(data: ExportData) {
  const { summary, customerRows } = data;
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  reportSheet(wb, "Summary", [
    ["3D Case Makers — Customer Report"],
    ["Period", summary.periodLabel], ["Generated", fmtDateTime(summary.generatedAt)],
    ["Basis", "Placed order value after discounts and shipping; excludes cancelled/returned orders."], [],
    ["Unique Customers", summary.uniqueCustomers], ["Total Orders", summary.totalOrders],
    ["Booked Order Value (₹)", summary.totalRevenue],
  ]);
  reportSheet(wb, "Customers", [
    ["Name", "Phone", "Email", "City", "State", "Orders", "Total Spent (₹)", "Last Order"],
    ...customerRows.map((c) => [c.name, c.phone, c.email, c.city, c.state, c.orderCount, c.totalSpent, fmtDate(c.lastOrderAt)]),
  ]);
  await downloadWorkbook(wb, `3dcasemakers-customer-report-${fileSlug(summary.periodLabel)}.xlsx`);
}

// ---------------- PDF exports ----------------

function pdfHeader(doc: jsPDF, title: string, summary: ExportSummary) {
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("3D Case Makers", 14, 16);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(title, 14, 23);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Period: ${summary.periodLabel}  ·  Generated: ${fmtDateTime(summary.generatedAt)}`, 14, 29);
  doc.setTextColor(0);
}

export function exportSalesPDF(data: ExportData) {
  const { summary, salesRows } = data;
  const doc = new jsPDF({ orientation: "landscape" });
  pdfHeader(doc, "Sales Report", summary);

  autoTable(doc, {
    startY: 34,
    head: [["Metric", "Value"]],
    body: [
      ["Total Orders", String(summary.totalOrders)],
      ["Cancelled Orders", String(summary.cancelledOrders)],
      ["Returned Orders", String(summary.returnedOrders || 0)],
      ["Booked Order Value", `₹${summary.totalRevenue.toLocaleString("en-IN")}`],
      ["Average Order Value", `₹${Math.round(summary.avgOrderValue).toLocaleString("en-IN")}`],
      ["Unique Customers", String(summary.uniqueCustomers)],
    ],
    theme: "plain",
    styles: { fontSize: 9 },
    columnStyles: { 0: { fontStyle: "bold" } },
    tableWidth: 100,
  });

  const afterSummaryY = (doc as any).lastAutoTable.finalY + 8;
  autoTable(doc, {
    startY: afterSummaryY,
    head: [["Order ID", "Date", "Customer", "Phone", "City", "State", "Items", "Total (₹)", "Payment", "Status"]],
    body: salesRows.map((r) => [
      r.id,
      fmtDate(r.date),
      r.customerName,
      r.customerPhone,
      r.city,
      r.state,
      String(r.itemsCount),
      r.total.toLocaleString("en-IN"),
      r.paymentMethod.toUpperCase(),
      r.status,
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [32, 34, 35] },
    didDrawPage: () => pdfHeader(doc, "Sales Report", summary),
  });

  doc.save(`3dcasemakers-sales-report-${fileSlug(summary.periodLabel)}.pdf`);
}

export function exportCustomerPDF(data: ExportData) {
  const { summary, customerRows } = data;
  const doc = new jsPDF({ orientation: "landscape" });
  pdfHeader(doc, "Customer Report", summary);

  autoTable(doc, {
    startY: 34,
    head: [["Metric", "Value"]],
    body: [
      ["Unique Customers", String(summary.uniqueCustomers)],
      ["Total Orders", String(summary.totalOrders)],
      ["Booked Order Value", `₹${summary.totalRevenue.toLocaleString("en-IN")}`],
    ],
    theme: "plain",
    styles: { fontSize: 9 },
    columnStyles: { 0: { fontStyle: "bold" } },
    tableWidth: 100,
  });

  const afterSummaryY = (doc as any).lastAutoTable.finalY + 8;
  autoTable(doc, {
    startY: afterSummaryY,
    head: [["Name", "Phone", "Email", "City", "State", "Orders", "Total Spent (₹)", "Last Order"]],
    body: customerRows.map((c) => [
      c.name,
      c.phone,
      c.email,
      c.city,
      c.state,
      String(c.orderCount),
      c.totalSpent.toLocaleString("en-IN"),
      fmtDate(c.lastOrderAt),
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [32, 34, 35] },
    didDrawPage: () => pdfHeader(doc, "Customer Report", summary),
  });

  doc.save(`3dcasemakers-customer-report-${fileSlug(summary.periodLabel)}.pdf`);
}
