export function cashierLayout({ title = "Cashier", subtitle = "", body = "" }) {
  return `
    <main class="pos-page">
      <header class="pos-header">
        <div>
          <span class="eyebrow">FinSage POS</span>
          <h1>${title}</h1>
          <p>${subtitle}</p>
        </div>
        <nav class="header-actions">
          <a href="#/cashier">Cashier</a>
          <a href="#/orders">Orders</a>
          <a href="#/manager">Manager</a>
        </nav>
      </header>
      ${body}
    </main>
  `;
}