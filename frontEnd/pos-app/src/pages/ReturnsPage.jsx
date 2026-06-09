import { useMemo, useState } from "react";
import { posApi } from "../services/posApi.js";
import { money } from "../utils/currency.js";

function getPosEmployee() {
  return JSON.parse(localStorage.getItem("pos_employee") || "null");
}

function getFsUser() {
  return JSON.parse(localStorage.getItem("fs_user") || "{}");
}

function isManagerOrSupervisor() {
  const posEmployee = getPosEmployee();
  const fsUser = getFsUser();

  const role = String(
    posEmployee?.role ||
    posEmployee?.pos_role ||
    fsUser?.role ||
    fsUser?.access_level ||
    ""
  ).toLowerCase();

  return (
    role.includes("manager") ||
    role.includes("supervisor") ||
    role.includes("owner") ||
    role.includes("admin")
  );
}

export function ReturnsPage() {
  const [returnNo, setReturnNo] = useState("");
  const [originalSaleId, setOriginalSaleId] = useState("");
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [qty, setQty] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [lines, setLines] = useState([]);
  const [message, setMessage] = useState("");

  const canApproveReturn = isManagerOrSupervisor();

  const refundAmount = useMemo(() => {
    return lines.reduce((sum, line) => sum + Number(line.gross_amount || 0), 0);
  }, [lines]);

  function addReturnLine() {
    const cleanDescription = description.trim();

    if (!cleanDescription) {
      setMessage("Description is required.");
      return;
    }

    const nQty = Number(qty || 1);
    const nPrice = Number(unitPrice || 0);

    setLines((prev) => [
      ...prev,
      {
        description: cleanDescription,
        qty: nQty,
        unit_price: nPrice,
        vat_amount: 0,
        gross_amount: nQty * nPrice,
        restock: true,
      },
    ]);

    setDescription("");
    setQty("1");
    setUnitPrice("");
    setMessage("");
  }

  async function saveReturn() {
    if (!lines.length) {
      setMessage("Add return lines first.");
      return;
    }

    if (!reason.trim()) {
      setMessage("Return reason is required.");
      return;
    }

    const approvalStatus = canApproveReturn ? "approved" : "pending_approval";

    try {
      const res = await posApi.createReturn({
        return_no: returnNo.trim() || `RET-${Date.now()}`,
        reason: reason.trim(),
        original_sale_id: originalSaleId || null,
        refund_method: "cash",
        refund_amount: refundAmount,
        approval_status: approvalStatus,
        status: approvalStatus,
        requires_manager_approval: !canApproveReturn,
        lines,
      });

      setMessage(
        canApproveReturn
          ? `Return approved and saved: ${res.return_id || res.data?.return_id || ""}`
          : `Return request saved and sent for manager approval: ${res.return_id || res.data?.return_id || ""}`
      );

      setLines([]);
      setReturnNo("");
      setOriginalSaleId("");
      setReason("");
    } catch (err) {
      setMessage(err.message || "Failed to save return.");
    }
  }

  return (
    <main className="pos-page">
      <header className="pos-header">
        <div>
          <span className="eyebrow">Returns</span>
          <h1>Customer Returns</h1>
          <p>
            {canApproveReturn
              ? "Approve customer returns and process refunds."
              : "Create return requests for manager approval."}
          </p>
        </div>

        <nav className="header-actions">
          <a href="#/cashier">Cashier</a>
          <a href="#/manager">Manager Workspace</a>
        </nav>
      </header>

      {message && <div className="pos-message">{message}</div>}

      {!canApproveReturn && (
        <div className="pos-message">
          Returns created by cashiers require manager or supervisor approval before refund processing.
        </div>
      )}

      <section className="pos-grid">
        <aside className="left-panel">
          <div className="scan-card">
            <label>Return information</label>

            <input
              className="scan-input"
              placeholder="Return number e.g. RET-001"
              value={returnNo}
              onChange={(e) => setReturnNo(e.target.value)}
            />

            <input
              className="scan-input"
              placeholder="Original sale ID optional"
              value={originalSaleId}
              onChange={(e) => setOriginalSaleId(e.target.value)}
            />

            <input
              className="scan-input"
              placeholder="Reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <div className="scan-card">
            <label>Add return item manually</label>

            <input
              className="scan-input"
              placeholder="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />

            <input
              className="scan-input"
              placeholder="Qty"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />

            <input
              className="scan-input"
              placeholder="Unit price"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
            />

            <button className="scan-btn" onClick={addReturnLine}>
              Add Return Line
            </button>
          </div>
        </aside>

        <section className="cart-panel">
          <div className="cart-header">
            <div>
              <h2>Return Basket</h2>
              <p>{lines.length} item(s)</p>
            </div>
            <span className="badge">
              {canApproveReturn ? "Approved Entry" : "Pending Approval"}
            </span>
          </div>

          <div className="cart-table">
            <div className="cart-head">
              <span>Item</span>
              <span>Qty</span>
              <span>Price</span>
              <span>Refund</span>
            </div>

            {lines.length ? (
              lines.map((line, idx) => (
                <div className="cart-line" key={idx}>
                  <span>
                    <strong>{line.description}</strong>
                  </span>
                  <span>{line.qty}</span>
                  <span>{money(line.unit_price)}</span>
                  <span>{money(line.gross_amount)}</span>
                </div>
              ))
            ) : (
              <div className="cart-empty">No return items added.</div>
            )}
          </div>

          <div className="summary-card">
            <div>
              <span>Refund Amount</span>
              <strong>{money(refundAmount)}</strong>
            </div>

            <div>
              <span>Approval Status</span>
              <strong>
                {canApproveReturn ? "Manager Approved" : "Pending Manager Approval"}
              </strong>
            </div>
          </div>

          <div className="payment-bar">
            <button className="primary" onClick={saveReturn}>
              {canApproveReturn ? "Approve & Save Return" : "Submit Return Request"}
            </button>

            <button className="soft" onClick={() => setLines([])}>
              Clear
            </button>
          </div>
        </section>
      </section>
    </main>
  );
}