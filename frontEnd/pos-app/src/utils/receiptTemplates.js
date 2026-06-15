import { money } from "./currency.js";

function safe(v) {
  return String(v ?? "").trim();
}

function esc(v) {
  return safe(v)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function line(label, value) {
  return `
    <div class="r-line">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `;
}

function baseCss(width = "80mm") {
  return `
    <style>
      @page { size: ${width} auto; margin: 4mm; }
      * { box-sizing: border-box; }
      body { font-family: Arial, sans-serif; font-size: 11px; color: #111; margin: 0; }
      .receipt { width: ${width}; max-width: ${width}; margin: 0 auto; }
      .center { text-align: center; }
      .left { text-align: left; }
      .logo { max-width: 38mm; max-height: 22mm; object-fit: contain; margin-bottom: 4px; }
      h1,h2,h3 { margin: 2px 0; }
      .motto { font-size: 10px; margin-top: 2px; font-style: italic; }
      .muted { color: #555; font-size: 10px; }
      .small { font-size: 10px; }
      .divider { border-top: 1px dashed #111; margin: 6px 0; }
      .solid { border-top: 1px solid #111; margin: 6px 0; }
      .r-line, .r-item { display: flex; justify-content: space-between; gap: 6px; }
      .r-line { margin: 2px 0; }
      .r-item { margin: 4px 0; align-items: flex-start; }
      .r-item div { flex: 1; }
      .r-item small { display: block; color: #555; }
      .total { font-size: 14px; font-weight: 800; }
      .badge { border: 1px solid #111; padding: 2px 5px; display: inline-block; font-size: 10px; }
      .boxed { border: 1px solid #111; padding: 6px; margin: 6px 0; }
      .qr { text-align:center; border:1px dashed #777; padding:6px; margin-top:8px; font-size:10px; }
      .watermark { text-align:center; font-size:10px; margin-top:6px; }
    </style>
  `;
}

function getLogo(company = {}, branding = {}) {
  return branding.logo_url || company.logo_url || "";
}

function getMotto(branding = {}, settings = {}) {
  return branding.footer_text || settings.footer_message || "";
}

function brandingHeader(company = {}, branding = {}, settings = {}) {
  const logo = getLogo(company, branding);
  const motto = getMotto(branding, settings);

  return `
    <div class="center">
      ${settings.show_logo && logo ? `<img class="logo" src="${esc(logo)}" />` : ""}
      <h2>${esc(company.name || branding.name || "Company")}</h2>
      ${settings.show_motto && motto ? `<div class="motto">${esc(motto)}</div>` : ""}
      <div class="muted">${esc(branding.address || company.physical_address || "")}</div>
      <div class="muted">${esc(branding.contact_phone || company.company_phone || "")}</div>
      ${
        settings.show_vat_no &&
        (
          company.is_vat_registered === true ||
          company.vat_registered === true ||
          company.tax_registered === true ||
          company.vat_no ||
          company.vat_number ||
          company.vat ||
          branding.vat_no
        ) &&
        (
          company.vat_no ||
          company.vat_number ||
          company.vat ||
          branding.vat_no
        )
          ? `<div class="muted">VAT No: ${esc(
              company.vat_no ||
              company.vat_number ||
              company.vat ||
              branding.vat_no
            )}</div>`
          : ""
      }
    </div>
  `;
}

function vatTreatmentLine(settings = {}) {
  return line(
    "VAT Treatment",
    settings.pricing_tax_mode === "exclusive"
      ? "VAT Added Separately"
      : "VAT Included in Prices"
  );
}

function receiptItems(items = [], compact = false) {
  return items.map((x) => {
    const desc = esc(x.description || x.name || "Item");
    const qty = Number(x.qty || 1);
    const total = money(x.gross_amount || x.total || 0);

    if (compact) {
      return `
        <div class="r-line">
          <span>${desc} x${qty}</span>
          <strong>${total}</strong>
        </div>
      `;
    }

    return `
      <div class="r-item">
        <div>
          <strong>${desc}</strong>
          <small>${esc(x.sku || x.barcode || "")}</small>
        </div>
        <span>${qty}</span>
        <span>${total}</span>
      </div>
    `;
  }).join("");
}

export function renderRetailClassicSlip({ company = {}, branding = {}, settings = {}, sale = {} }) {
  const items = sale.lines || sale.items || [];

  return `
    <!doctype html>
    <html>
      <head>${baseCss("80mm")}</head>
      <body>
        <div class="receipt">
          ${brandingHeader(company, branding, settings)}

          <div class="divider"></div>

          <div class="center">
            <strong>TAX INVOICE / RECEIPT</strong><br/>
            <span>Tax Invoice No: ${esc(sale.invoice_no || sale.sale_no || "DRAFT")}</span>
          </div>

          ${vatTreatmentLine(settings)}
          
          <div class="divider"></div>

          ${line("Date", esc(sale.sale_date || sale.date || new Date().toLocaleString()))}
          ${settings.show_cashier_name ? line("Cashier", esc(sale.cashier_name || "-")) : ""}
          ${line("Terminal", esc(sale.terminal_code || "-"))}

          <div class="divider"></div>

          ${receiptItems(items)}

          <div class="divider"></div>

          ${line("Subtotal", money(sale.subtotal || 0))}
          ${line("Discount", money(sale.discount_amount || 0))}
          ${line("VAT", money(sale.vat_amount || 0))}
          ${line(`<span class="total">TOTAL</span>`, `<span class="total">${money(sale.gross_amount || sale.total || 0)}</span>`)}

          <div class="divider"></div>

          ${line("Paid", money(sale.amount_paid || 0))}
          ${line("Change", money(sale.change_amount || 0))}

          <div class="divider"></div>

          <div class="center">
            <strong>${esc(settings.footer_message || "Thank you for your business.")}</strong>
            <div class="muted">${esc(settings.returns_policy || "")}</div>
          </div>
        </div>
      </body>
    </html>
  `;
}

export function renderRetailCompactSlip({ company = {}, branding = {}, settings = {}, sale = {} }) {
  const items = sale.lines || sale.items || [];

  return `
    <!doctype html>
    <html>
      <head>${baseCss("58mm")}</head>
      <body>
        <div class="receipt">
          <div class="center">
            <strong>${esc(company.name || "Company")}</strong><br/>
            ${company.vat ? `<span class="muted">VAT: ${esc(company.vat)}</span><br/>` : ""}
            <span>Tax Invoice No: ${esc(sale.invoice_no || sale.sale_no || "DRAFT")}</span>
          </div>

          <div class="divider"></div>

          ${receiptItems(items, true)}

          <div class="divider"></div>

          ${line("VAT", money(sale.vat_amount || 0))}
          ${line(`<span class="total">TOTAL</span>`, `<span class="total">${money(sale.gross_amount || sale.total || 0)}</span>`)}

          <div class="divider"></div>

          <div class="center">${esc(settings.footer_message || "Thank you!")}</div>
        </div>
      </body>
    </html>
  `;
}

export function renderRetailModernSlip({ company = {}, branding = {}, settings = {}, sale = {} }) {
  const items = sale.lines || sale.items || [];
  const phone = branding.contact_phone || company.company_phone || "";
  const website = branding.website || "";

  return `
    <!doctype html>
    <html>
      <head>${baseCss("80mm")}</head>
      <body>
        <div class="receipt">
          ${brandingHeader(company, branding, settings)}

          <div class="solid"></div>

          <div class="center">
            <span class="badge">RETAIL TAX INVOICE</span>
            <h3>Tax Invoice No: ${esc(sale.invoice_no || sale.sale_no || "DRAFT")}</h3>
          </div>

          <div class="boxed">
            ${line("Date", esc(sale.sale_date || sale.date || new Date().toLocaleString()))}
            ${settings.show_cashier_name ? line("Served by", esc(sale.cashier_name || "-")) : ""}
            ${line("Terminal", esc(sale.terminal_code || "-"))}
            ${settings.show_customer_name ? line("Customer", esc(sale.customer_name || "Walk-in")) : ""}
          </div>

          ${receiptItems(items)}

          <div class="solid"></div>

          ${line("Subtotal", money(sale.subtotal || 0))}
          ${line("Discount", money(sale.discount_amount || 0))}
          ${line("VAT", money(sale.vat_amount || 0))}
          ${line(`<span class="total">TOTAL DUE</span>`, `<span class="total">${money(sale.gross_amount || sale.total || 0)}</span>`)}

          <div class="solid"></div>

          ${line("Payment", esc(sale.payment_method || "Cash/Card"))}
          ${line("Paid", money(sale.amount_paid || 0))}
          ${line("Change", money(sale.change_amount || 0))}

          <div class="qr">
            ${website ? `Visit: ${esc(website)}<br/>` : ""}
            ${phone ? `Call/WhatsApp: ${esc(phone)}<br/>` : ""}
            Keep this receipt for returns and warranty.
          </div>

          <div class="watermark">Powered by FinSage POS</div>
        </div>
      </body>
    </html>
  `;
}

export function renderRestaurantBillSlip({ company = {}, branding = {}, settings = {}, order = {} }) {
  const items = order.lines || order.items || [];

  const subtotal = Number(order.subtotal || 0);
  const vat = Number(order.vat_amount || 0);
  const gratuityPercent = Number(order.gratuity_percent ?? settings.gratuity_percent ?? 0);
  const gratuityAmount = Number(
    order.gratuity_amount ??
    (gratuityPercent > 0 ? subtotal * gratuityPercent / 100 : 0)
  );
  const totalDue = Number(order.gross_amount || order.total || 0) + gratuityAmount;

  return `
    <!doctype html>
    <html>
      <head>${baseCss("80mm")}</head>
      <body>
        <div class="receipt">
          ${brandingHeader(company, branding, settings)}

          <div class="divider"></div>

          <div class="center">
            <strong>TABLE BILL</strong><br/>
            <span>Order No: ${esc(order.order_no || "DRAFT")}</span>
          </div>

          <div class="divider"></div>

          ${line("Table", esc(order.table_no || order.table_name || "-"))}
          ${line("Waiter", esc(order.waiter_name || "-"))}
          ${line("Guests", esc(order.guests || "-"))}
          ${line("Time", esc(order.created_at || new Date().toLocaleString()))}

          <div class="divider"></div>

          ${receiptItems(items)}

          <div class="divider"></div>

          ${line("Subtotal", money(subtotal))}
          ${line("VAT", money(vat))}
          ${gratuityAmount > 0 ? line(`Tip / Gratuity ${gratuityPercent ? `(${gratuityPercent}%)` : ""}`, money(gratuityAmount)) : ""}
          ${line(`<span class="total">AMOUNT DUE</span>`, `<span class="total">${money(totalDue)}</span>`)}

          <div class="divider"></div>

          <div class="center muted">
            This is not a tax invoice.<br/>
            Tax invoice issued after payment.
          </div>
        </div>
      </body>
    </html>
  `;
}

export function renderKitchenTicketSlip({ company = {}, settings = {}, ticket = {} }) {
  const items = ticket.lines || ticket.items || [];

  return `
    <!doctype html>
    <html>
      <head>${baseCss("80mm")}</head>
      <body>
        <div class="receipt">
          <div class="center">
            <h2>KITCHEN TICKET</h2>
            <strong>Order: ${esc(ticket.order_no || "DRAFT")}</strong>
          </div>

          <div class="divider"></div>

          ${line("Table", esc(ticket.table_no || "-"))}
          ${line("Waiter", esc(ticket.waiter_name || "-"))}
          ${line("Station", esc(ticket.station_name || "Kitchen"))}
          ${line("Time", esc(ticket.created_at || new Date().toLocaleTimeString()))}

          <div class="divider"></div>

          ${items.map((x) => `
            <div style="margin-bottom:8px;">
              <strong>${Number(x.qty || 1)}x ${esc(x.description || x.name || "Item")}</strong>
              ${x.notes ? `<div class="muted">Note: ${esc(x.notes)}</div>` : ""}
            </div>
          `).join("")}

          <div class="divider"></div>

          <div class="center">
            <strong>${esc(ticket.status || "WAITING").toUpperCase()}</strong>
          </div>
        </div>
      </body>
    </html>
  `;
}

export function renderDeliverySlip({ company = {}, branding = {}, settings = {}, order = {} }) {
  const items = order.lines || order.items || [];

  return `
    <!doctype html>
    <html>
      <head>${baseCss("80mm")}</head>
      <body>
        <div class="receipt">
          ${brandingHeader(company, branding, settings)}

          <div class="divider"></div>

          <div class="center">
            <h3>DELIVERY SLIP</h3>
            <strong>Order No: ${esc(order.order_no || "DRAFT")}</strong>
          </div>

          <div class="divider"></div>

          ${line("Customer", esc(order.customer_name || "-"))}
          ${line("Phone", esc(order.customer_phone || "-"))}
          ${line("Driver", esc(order.driver_name || "Pending"))}

          <div class="boxed">
            <strong>Delivery Address</strong><br/>
            ${esc(order.delivery_address || "-")}
            ${order.delivery_notes ? `<br/><span class="muted">Note: ${esc(order.delivery_notes)}</span>` : ""}
          </div>

          <div class="divider"></div>

          ${receiptItems(items, true)}

          <div class="divider"></div>

          ${line("Items Total", money(order.subtotal || 0))}
          ${line("Delivery Fee", money(order.delivery_fee || 0))}
          ${line("VAT", money(order.vat_amount || 0))}
          ${line(`<span class="total">TOTAL</span>`, `<span class="total">${money(order.gross_amount || order.total || 0)}</span>`)}

          <div class="divider"></div>

          <div class="center muted">
            Customer signature: __________________
          </div>
        </div>
      </body>
    </html>
  `;
}

export function renderSlip(payload = {}) {
  const template = payload?.settings?.slip_template || "retail_classic";

  if (template === "retail_classic" || template === "classic") {
    return renderRetailClassicSlip(payload);
  }

  if (template === "retail_compact") {
    return renderRetailCompactSlip(payload);
  }

  if (template === "retail_modern") {
    return renderRetailModernSlip(payload);
  }

  if (template === "restaurant_bill") {
    return renderRestaurantBillSlip(payload);
  }

  if (template === "kitchen_ticket") {
    return renderKitchenTicketSlip(payload);
  }

  if (template === "delivery_slip") {
    return renderDeliverySlip(payload);
  }

  return renderRetailClassicSlip(payload);
}

export function printHtml(html) {
  const win = window.open("", "_blank", "width=420,height=720");

  if (!win) {
    alert("Popup blocked. Please allow popups for POS printing.");
    return;
  }

  win.document.write(html);
  win.document.close();
  win.focus();

  setTimeout(() => {
    win.print();
  }, 300);
}

export const SLIP_TEMPLATE_OPTIONS = [
  { value: "retail_classic", label: "Retail Classic" },
  { value: "retail_compact", label: "Retail Compact" },
  { value: "retail_modern", label: "Retail Modern Branded" },
  { value: "restaurant_bill", label: "Restaurant Bill" },
  { value: "kitchen_ticket", label: "Kitchen Ticket" },
  { value: "delivery_slip", label: "Delivery Slip" },
];