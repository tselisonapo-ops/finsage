// FinSage POS — Consolidated Sales Invoice Report Printer
// Supports continuous receipt roll (80mm) and standard A4 supporting document

import { money } from "../utils/currency.js";

export function renderCashupReportHtml({ report, company = {}, format = "roll" }) {
  const isA4 = format === "a4";
  const now = new Date();
  const timestamp = now.toLocaleDateString() + " " + now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const companyName = company.name || "FinSphere Solutions";
  const vatNo = company.vat || company.tax_number || "";
  const refNo = report.report_reference || `CU-${report.shift_id}`;
  const cashier = report.cashier_name || "Cashier";
  const businessDate = report.business_date ? new Date(report.business_date).toLocaleDateString() : now.toLocaleDateString();
  const terminal = report.terminal_name || "POS Terminal";
  const invoices = report.invoices || [];
  const summary = report.session_summary || {};

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Sales Invoice Roll - ${refNo}</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, monospace;
      color: #0f172a;
      background: #ffffff;
      padding: ${isA4 ? "24mm 20mm" : "10px 8px"};
      font-size: ${isA4 ? "12px" : "11px"};
      line-height: 1.35;
      width: ${isA4 ? "210mm" : "78mm"};
      margin: 0 auto;
    }
    .header {
      text-align: center;
      border-bottom: 2px dashed #334155;
      padding-bottom: 8px;
      margin-bottom: 10px;
    }
    .title {
      font-size: ${isA4 ? "16px" : "13px"};
      font-weight: 800;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .company {
      font-size: ${isA4 ? "14px" : "12px"};
      font-weight: 700;
      margin-top: 2px;
    }
    .subtitle {
      font-size: 10px;
      font-weight: 600;
      color: #475569;
      margin-top: 2px;
      letter-spacing: 0.3px;
    }
    .meta-box {
      border-bottom: 1px dashed #cbd5e1;
      padding-bottom: 6px;
      margin-bottom: 8px;
    }
    .meta-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 2px;
      font-size: 10.5px;
    }
    .meta-label {
      color: #475569;
      font-weight: 500;
    }
    .meta-value {
      font-weight: 700;
    }
    .section-title {
      font-weight: 800;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 3px;
      margin: 8px 0 6px 0;
    }
    .invoice-card {
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      padding: 6px 8px;
      margin-bottom: 6px;
      background: #fafafa;
      page-break-inside: avoid;
    }
    .invoice-card.refund {
      border-color: #fca5a5;
      background: #fff5f5;
    }
    .invoice-header {
      display: flex;
      justify-content: space-between;
      font-weight: 700;
      font-size: 11px;
      border-bottom: 1px dotted #cbd5e1;
      padding-bottom: 3px;
      margin-bottom: 4px;
    }
    .badge {
      display: inline-block;
      font-size: 9px;
      font-weight: 700;
      padding: 1px 4px;
      border-radius: 3px;
      background: #e2e8f0;
      color: #334155;
    }
    .badge.refund {
      background: #fee2e2;
      color: #dc2626;
    }
    .badge.cash { background: #dcfce7; color: #15803d; }
    .badge.card { background: #e0f2fe; color: #0369a1; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 4px 0;
      font-size: ${isA4 ? "11px" : "10px"};
    }
    th, td {
      padding: 2px 0;
      text-align: left;
    }
    td.amount, th.amount {
      text-align: right;
    }
    .invoice-subtotal {
      display: flex;
      justify-content: space-between;
      border-top: 1px dotted #cbd5e1;
      padding-top: 3px;
      font-weight: 700;
      font-size: 10.5px;
    }
    .summary-box {
      border: 1.5px solid #0f172a;
      border-radius: 4px;
      padding: 8px;
      margin-top: 10px;
      background: #f8fafc;
      page-break-inside: avoid;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      padding: 2px 0;
      font-size: 10.5px;
    }
    .summary-row.bold {
      font-weight: 800;
      border-top: 1px solid #cbd5e1;
      padding-top: 4px;
      margin-top: 3px;
    }
    .summary-row.grand {
      font-size: 12px;
      font-weight: 800;
      border-top: 2px solid #0f172a;
      padding-top: 4px;
      margin-top: 4px;
    }
    .recon-box {
      margin-top: 8px;
      padding-top: 6px;
      border-top: 1px dashed #cbd5e1;
      font-size: 10px;
    }
    .footer {
      text-align: center;
      margin-top: 12px;
      padding-top: 6px;
      border-top: 1px dotted #94a3b8;
      font-size: 9px;
      color: #64748b;
    }
    @media print {
      body {
        padding: ${isA4 ? "15mm" : "0"};
        width: 100%;
      }
      .no-print {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">SALES INVOICE ROLL</div>
    <div class="company">${companyName}</div>
    ${vatNo ? `<div class="subtitle">VAT Reg No: ${vatNo}</div>` : ""}
    <div class="subtitle">CASH-UP SUPPORTING DOCUMENT</div>
  </div>

  <div class="meta-box">
    <div class="meta-row">
      <span class="meta-label">Cashier:</span>
      <span class="meta-value">${cashier}</span>
    </div>
    <div class="meta-row">
      <span class="meta-label">Cash-up Ref:</span>
      <span class="meta-value">${refNo}</span>
    </div>
    <div class="meta-row">
      <span class="meta-label">Business Date:</span>
      <span class="meta-value">${businessDate}</span>
    </div>
    <div class="meta-row">
      <span class="meta-label">Terminal / Station:</span>
      <span class="meta-value">${terminal}</span>
    </div>
    <div class="meta-row">
      <span class="meta-label">Generated At:</span>
      <span class="meta-value">${timestamp}</span>
    </div>
  </div>

  <div class="section-title">Invoices in Cash-up Session (${invoices.length})</div>

  ${
    invoices.length === 0
      ? '<div style="text-align: center; color: #64748b; padding: 12px 0;">No sales invoices recorded for this cash-up session.</div>'
      : invoices.map((inv, idx) => {
          const isRefund = (inv.sale_type || "").includes("refund") || Number(inv.total_amount) < 0;
          return `
          <div class="invoice-card ${isRefund ? "refund" : ""}">
            <div class="invoice-header">
              <span>#${idx + 1} — ${inv.invoice_number}</span>
              <span class="badge ${isRefund ? "refund" : (inv.payment_method || "").toLowerCase()}">${inv.payment_method || "CASH"}</span>
            </div>
            <div style="font-size: 9.5px; color: #64748b; margin-bottom: 3px;">
              Customer: ${inv.customer_name || "Walk-in"} ${inv.customer_phone ? `• ${inv.customer_phone}` : ""}
            </div>
            <table>
              <thead>
                <tr style="color: #64748b; font-size: 9px; border-bottom: 0.5px solid #e2e8f0;">
                  <th>Item</th>
                  <th style="text-align: center;">Qty</th>
                  <th class="amount">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${(inv.lines || []).map(l => `
                  <tr>
                    <td>${l.name || l.description || "Item"}</td>
                    <td style="text-align: center;">${l.qty || 1}</td>
                    <td class="amount">${money(l.amount || (l.qty * l.unit_price))}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
            <div class="invoice-subtotal">
              <span>Total</span>
              <span>${money(inv.total_amount)}</span>
            </div>
          </div>
          `;
        }).join("")
  }

  <div class="summary-box">
    <div class="section-title" style="margin-top: 0;">Session Summary</div>
    <div class="summary-row">
      <span>Number of Invoices</span>
      <span>${summary.invoice_count ?? invoices.length}</span>
    </div>
    <div class="summary-row">
      <span>Total Sales</span>
      <span>${money(summary.total_sales || 0)}</span>
    </div>
    <div class="summary-row">
      <span>Cash Sales</span>
      <span>${money(summary.cash_sales || 0)}</span>
    </div>
    <div class="summary-row">
      <span>Card / Electronic Sales</span>
      <span>${money(summary.card_sales || 0)}</span>
    </div>
    ${Number(summary.other_sales || 0) > 0 ? `
    <div class="summary-row">
      <span>Other / Account Sales</span>
      <span>${money(summary.other_sales || 0)}</span>
    </div>` : ""}
    <div class="summary-row grand">
      <span>Grand Total</span>
      <span>${money(summary.grand_total || 0)}</span>
    </div>

    <div class="recon-box">
      <div style="font-weight: 700; margin-bottom: 2px; text-transform: uppercase;">Cash-up Reconciliation</div>
      <div class="summary-row">
        <span>Opening Float</span>
        <span>${money(summary.opening_float || 0)}</span>
      </div>
      <div class="summary-row">
        <span>Expected Cash Drawer</span>
        <span>${money(summary.expected_cash || 0)}</span>
      </div>
      <div class="summary-row">
        <span>Counted Cash Amount</span>
        <span>${money(summary.counted_cash || 0)}</span>
      </div>
      <div class="summary-row bold" style="color: ${Number(summary.reconciliation_diff || 0) === 0 ? '#15803d' : '#dc2626'}">
        <span>Variance / Difference</span>
        <span>${money(summary.reconciliation_diff || 0)}</span>
      </div>
    </div>
  </div>

  <div class="footer">
    <div>FinSage Cloud POS • Supporting Audit Trail</div>
    <div>Session ${refNo} • Printed on ${timestamp}</div>
  </div>
</body>
</html>`;
}

export function printCashupReport({ report, company = {}, format = "roll" }) {
  const html = renderCashupReportHtml({ report, company, format });
  const printWindow = window.open("", "_blank", "width=850,height=900");
  if (!printWindow) {
    alert("Please allow popups to print the consolidated cash-up report.");
    return;
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, 350);
}
