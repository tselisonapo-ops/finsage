export function SearchBox({ id = "searchInput", placeholder = "Search...", buttonText = "Search" }) {
  return `
    <div class="scan-row">
      <input id="${id}" class="scan-input" placeholder="${placeholder}" />
      <button class="scan-btn" data-search-for="${id}">${buttonText}</button>
    </div>
  `;
}