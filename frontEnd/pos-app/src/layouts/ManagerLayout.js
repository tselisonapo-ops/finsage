export function managerLayout({ title = "Manager", subtitle = "", body = "" }) {
  return `
    <main class="pos-page">
      <header class="pos-header">
        <div>
          <span class="eyebrow">Store Manager</span>
          <h1>${title}</h1>
          <p>${subtitle}</p>
        </div>
        <nav class="header-actions">
          <a href="#/cashier">Cashier</a>
          <a href="#/orders">Orders</a>
          <button onclick="window.location.href='/dashboard'">Back to FinSage</button>
        </nav>
      </header>
      ${body}
    </main>
  `;
}