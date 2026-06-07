export function DataTable({ columns = [], rows = [], empty = "No records found." }) {
  if (!rows.length) {
    return `<div class="empty-state"><strong>${empty}</strong></div>`;
  }

  return `
    <div class="data-table">
      <div class="data-table-head" style="grid-template-columns: repeat(${columns.length}, 1fr)">
        ${columns.map(c => `<span>${c.label}</span>`).join("")}
      </div>
      ${rows.map(row => `
        <div class="data-table-row" style="grid-template-columns: repeat(${columns.length}, 1fr)">
          ${columns.map(c => `<span>${row[c.key] ?? ""}</span>`).join("")}
        </div>
      `).join("")}
    </div>
  `;
}