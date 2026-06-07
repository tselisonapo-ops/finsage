export const printingApi = {
  printPage() {
    window.print();
  },

  printReceipt(html) {
    const w = window.open("", "_blank", "width=420,height=700");
    if (!w) return;

    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  },
};