export function openModal({ title = "", body = "", footer = "" }) {
  closeModal();

  const wrap = document.createElement("div");
  wrap.className = "modal-backdrop";
  wrap.id = "posModal";
  wrap.innerHTML = `
    <div class="modal-card">
      <div class="modal-head">
        <h2>${title}</h2>
        <button id="modalCloseBtn">×</button>
      </div>
      <div class="modal-body">${body}</div>
      <div class="modal-footer">${footer}</div>
    </div>
  `;

  document.body.appendChild(wrap);
  document.querySelector("#modalCloseBtn")?.addEventListener("click", closeModal);
}

export function closeModal() {
  document.querySelector("#posModal")?.remove();
}