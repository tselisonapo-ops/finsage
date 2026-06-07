export function LoadingSpinner(text = "Loading...") {
  return `
    <div class="loading-box">
      <div class="spinner"></div>
      <strong>${text}</strong>
    </div>
  `;
}