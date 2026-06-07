import { money } from "../utils/currency.js";

export function printTaxInvoice({
  company,
  invoice,
  customer,
  lines = [],
  totals = {},
}) {

  const html = `
  <html>
  <head>
    <title>Tax Invoice</title>

    <style>
      body {
        font-family: Arial;
        margin: 30px;
      }

      table {
        width: 100%;
        border-collapse: collapse;
      }

      th,
      td {
        border: 1px solid #ddd;
        padding: 6px;
      }
    </style>
  </head>

  <body>

    <h1>TAX INVOICE</h1>

    <h2>${company.name}</h2>

    <p>
      VAT No: ${company.vat || ""}
      <br>
      Invoice No: ${invoice.invoice_no}
      <br>
      Date: ${invoice.invoice_date}
    </p>

    <h3>Customer</h3>

    <p>
      ${customer.customer_name || "Walk-in Customer"}
    </p>

    <table>

      <thead>
        <tr>
          <th>Description</th>
          <th>Qty</th>
          <th>Price</th>
          <th>Total</th>
        </tr>
      </thead>

      <tbody>

      ${lines.map(x => `
      <tr>
        <td>${x.description}</td>
        <td>${x.qty}</td>
        <td>${money(x.unit_price)}</td>
        <td>${money(x.gross_amount)}</td>
      </tr>
      `).join("")}

      </tbody>

    </table>

    <br>

    <table>

      <tr>
        <td>Subtotal</td>
        <td>${money(totals.subtotal)}</td>
      </tr>

      <tr>
        <td>VAT</td>
        <td>${money(totals.vat)}</td>
      </tr>

      <tr>
        <td>Total</td>
        <td>${money(totals.gross)}</td>
      </tr>

    </table>

  </body>
  </html>
  `;

  const win = window.open("", "_blank");
  win.document.write(html);
  win.document.close();
  win.print();
}