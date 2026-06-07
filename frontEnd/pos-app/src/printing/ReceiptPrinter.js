import { money } from "../utils/currency.js";

export function printReceipt({
  company,
  sale,
  lines = [],
  totals = {},
}) {
  const html = `
  <html>
  <head>
    <title>Receipt</title>
    <style>
      body {
        font-family: Arial;
        width: 80mm;
        margin: 0 auto;
      }

      table {
        width: 100%;
        border-collapse: collapse;
      }

      td {
        padding: 3px;
      }

      .center {
        text-align: center;
      }

      .right {
        text-align: right;
      }
    </style>
  </head>

  <body>

    <div class="center">
      <h3>${company.name}</h3>
      <p>${company.company_phone || ""}</p>
    </div>

    <hr>

    <p>
      Receipt No: ${sale.sale_no}
      <br>
      Date: ${sale.sale_date}
    </p>

    <table>
      ${lines.map(x => `
      <tr>
        <td>${x.description}</td>
        <td class="right">${x.qty}</td>
        <td class="right">${money(x.gross_amount)}</td>
      </tr>
      `).join("")}
    </table>

    <hr>

    <table>
      <tr>
        <td>Total</td>
        <td class="right">${money(totals.gross)}</td>
      </tr>
    </table>

    <div class="center">
      Thank you
    </div>

  </body>
  </html>
  `;

  const win = window.open("", "_blank");
  win.document.write(html);
  win.document.close();
  win.print();
}