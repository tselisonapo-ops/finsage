export function printBarcodeLabel({
  barcode,
  itemName,
  price,
}) {

  const html = `
  <html>
  <head>

    <style>

      body {
        font-family: Arial;
      }

      .label {
        width: 50mm;
        height: 30mm;
        border: 1px solid #000;
        padding: 5px;
      }

      .name {
        font-weight: bold;
      }

      .barcode {
        font-family: monospace;
        font-size: 18px;
      }

    </style>

  </head>

  <body>

    <div class="label">

      <div class="name">
        ${itemName}
      </div>

      <div class="barcode">
        *${barcode}*
      </div>

      <div>
        ${price}
      </div>

    </div>

  </body>
  </html>
  `;

  const win = window.open("", "_blank");

  win.document.write(html);
  win.document.close();
  win.print();
}