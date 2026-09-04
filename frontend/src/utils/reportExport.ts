import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
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
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};
const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
};
const fileSlug = (periodLabel: string) => `${periodLabel.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}`;

export interface StockPosBillRow {
  id: string;
  productName: string;
  model: string;
  quantity: number;
  channel: string;
  note: string;
  unitPrice: number | null;
  totalPrice: number | null;
  billedAt: string;
}
export interface StockExportSummary {
  periodKey: string;
  periodLabel: string;
  totalBills: number;
  totalUnits: number;
  totalAmount: number;
  generatedAt: string;
}

// ---------------- Manage Stocks — POS Bill export ----------------
// Auditor-facing file: styled header band, right-aligned/₹-formatted money
// columns, thin borders on every cell, zebra striping, a frozen header row,
// and a totals row at the foot of the bills sheet that sums Quantity and
// Total Price so it can be tie-checked against the Summary sheet at a glance.

export async function exportPosBillsExcel(summary: StockExportSummary, bills: StockPosBillRow[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "3D Case Makers";
  wb.created = new Date();

  // ---- Summary sheet ----
  const s = wb.addWorksheet("Summary", { views: [{ showGridLines: false }] });
  s.columns = [{ width: 26 }, { width: 30 }];

  s.mergeCells("A1:B1");
  const title = s.getCell("A1");
  title.value = "3D Case Makers — POS Bill Report";
  title.font = { bold: true, size: 14 };
  s.getRow(1).height = 24;

  const metaRows: [string, string | number][] = [
    ["Period", summary.periodLabel],
    ["Generated", fmtDateTime(summary.generatedAt)],
  ];
  const statRows: [string, string | number][] = [
    ["Total POS Bills", summary.totalBills],
    ["Total Units Sold", summary.totalUnits],
    ["Total Amount (₹)", summary.totalAmount],
  ];

  let r = 3;
  for (const [label, value] of metaRows) {
    s.getCell(`A${r}`).value = label;
    s.getCell(`A${r}`).font = { bold: true, color: { argb: "FF6D7175" } };
    s.getCell(`B${r}`).value = value;
    r++;
  }
  r++; // blank spacer row
  for (const [label, value] of statRows) {
    s.getCell(`A${r}`).value = label;
    s.getCell(`A${r}`).font = { bold: true };
    const valCell = s.getCell(`B${r}`);
    valCell.value = value;
    valCell.font = { bold: true, size: 12 };
    if (label.includes("₹")) valCell.numFmt = "₹#,##0.00";
    r++;
  }
  for (let row = 3; row < r; row++) {
    s.getRow(row).eachCell({ includeEmpty: true }, (cell) => {
      if (cell.value !== undefined && cell.value !== null && cell.value !== "") {
        cell.border = thinBorder;
      }
    });
  }

  // ---- POS Bills sheet ----
  const b = wb.addWorksheet("POS Bills", {
    views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
  });

  const columns: { header: string; key: string; width: number }[] = [
    { header: "POS Billed Date", key: "billedAt", width: 20 },
    { header: "Phone Model", key: "model", width: 24 },
    { header: "Product", key: "productName", width: 26 },
    { header: "Quantity", key: "quantity", width: 11 },
    { header: "Unit Price (₹)", key: "unitPrice", width: 15 },
    { header: "Total Price (₹)", key: "totalPrice", width: 16 },
    { header: "Channel", key: "channel", width: 12 },
    { header: "Note", key: "note", width: 28 },
  ];
  b.columns = columns;

  const headerRow = b.getRow(1);
  headerRow.height = 20;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: HEADER_FONT } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = thinBorder;
  });

  bills.forEach((bill, i) => {
    const row = b.addRow({
      billedAt: fmtDateTime(bill.billedAt),
      model: bill.model,
      productName: bill.productName,
      quantity: bill.quantity,
      unitPrice: bill.unitPrice ?? null,
      totalPrice: bill.totalPrice ?? null,
      channel: bill.channel ? (bill.channel === "website" ? "Website" : "Offline") : "",
      note: bill.note || "",
    });
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.border = thinBorder;
      const key = columns[colNumber - 1]?.key;
      if (key === "quantity") cell.alignment = { horizontal: "center" };
      if (key === "unitPrice" || key === "totalPrice") {
        cell.alignment = { horizontal: "right" };
        cell.numFmt = "₹#,##0.00";
      }
      if (key === "channel") cell.alignment = { horizontal: "center" };
      if (i % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA_FILL } };
      }
    });
  });

  // Totals row — sums Quantity and Total Price so the sheet self-checks
  // against the Summary tab without the auditor needing a calculator.
  const totalsRow = b.addRow({
    billedAt: "",
    model: "",
    productName: "TOTAL",
    quantity: bills.reduce((sum, x) => sum + (x.quantity || 0), 0),
    unitPrice: null,
    totalPrice: bills.reduce((sum, x) => sum + (x.totalPrice || 0), 0),
    channel: "",
    note: "",
  });
  totalsRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    cell.border = { ...thinBorder, top: { style: "double", color: { argb: "FF202223" } } };
    cell.font = { bold: true };
    const key = columns[colNumber - 1]?.key;
    if (key === "quantity") cell.alignment = { horizontal: "center" };
    if (key === "totalPrice") {
      cell.alignment = { horizontal: "right" };
      cell.numFmt = "₹#,##0.00";
    }
  });

  if (bills.length === 0) {
    b.mergeCells("A2:H2");
    const empty = b.getCell("A2");
    empty.value = "No POS bills recorded in this period.";
    empty.alignment = { horizontal: "center" };
    empty.font = { italic: true, color: { argb: "FF8C9196" } };
  }

  await downloadWorkbook(wb, `3dcasemakers-pos-bills-${fileSlug(summary.periodLabel)}.xlsx`);
}

// ---------------- Excel (.xlsx) exports ----------------

export function exportSalesExcel(data: ExportData) {
  const { summary, salesRows } = data;
  const wb = XLSX.utils.book_new();

  const summarySheet = XLSX.utils.aoa_to_sheet([
    ["3D Case Makers — Sales Report"],
    ["Period", summary.periodLabel],
    ["Generated", fmtDateTime(summary.generatedAt)],
    [],
    ["Total Orders", summary.totalOrders],
    ["Cancelled Orders", summary.cancelledOrders],
    ["Total Revenue (₹)", summary.totalRevenue],
    ["Average Order Value (₹)", Math.round(summary.avgOrderValue)],
    ["Unique Customers", summary.uniqueCustomers],
  ]);
  XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

  const ordersSheet = XLSX.utils.json_to_sheet(
    salesRows.map((r) => ({
      "Order ID": r.id,
      Date: fmtDate(r.date),
      Customer: r.customerName,
      Phone: r.customerPhone,
      City: r.city,
      State: r.state,
      Items: r.itemsCount,
      "Subtotal (₹)": r.subtotal,
      "Shipping (₹)": r.shipping,
      "Discount (₹)": r.discount,
      "Total (₹)": r.total,
      Payment: r.paymentMethod.toUpperCase(),
      Status: r.status,
    }))
  );
  XLSX.utils.book_append_sheet(wb, ordersSheet, "Orders");

  XLSX.writeFile(wb, `3dcasemakers-sales-report-${fileSlug(summary.periodLabel)}.xlsx`);
}

export function exportCustomerExcel(data: ExportData) {
  const { summary, customerRows } = data;
  const wb = XLSX.utils.book_new();

  const summarySheet = XLSX.utils.aoa_to_sheet([
    ["3D Case Makers — Customer Report"],
    ["Period", summary.periodLabel],
    ["Generated", fmtDateTime(summary.generatedAt)],
    [],
    ["Unique Customers", summary.uniqueCustomers],
    ["Total Orders", summary.totalOrders],
    ["Total Revenue (₹)", summary.totalRevenue],
  ]);
  XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

  const customersSheet = XLSX.utils.json_to_sheet(
    customerRows.map((c) => ({
      Name: c.name,
      Phone: c.phone,
      Email: c.email,
      City: c.city,
      State: c.state,
      Orders: c.orderCount,
      "Total Spent (₹)": c.totalSpent,
      "Last Order": fmtDate(c.lastOrderAt),
    }))
  );
  XLSX.utils.book_append_sheet(wb, customersSheet, "Customers");

  XLSX.writeFile(wb, `3dcasemakers-customer-report-${fileSlug(summary.periodLabel)}.xlsx`);
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
      ["Total Revenue", `₹${summary.totalRevenue.toLocaleString("en-IN")}`],
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
      ["Total Revenue", `₹${summary.totalRevenue.toLocaleString("en-IN")}`],
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
