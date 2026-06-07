import { useState } from "react";
import { money } from "../utils/currency.js";

export function PaymentModal({ total = 0, onClose, onConfirm }) {
  const [method, setMethod] = useState("cash");
  const [received, setReceived] = useState(String(total));

  const change = Math.max(0, Number(received || 0) - Number(total || 0));

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-head">
          <h2>Payment</h2>
          <button onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <label>Payment method</label>
          <select className="scan-input" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="eft">EFT</option>
            <option value="mobile_money">Mobile Money</option>
          </select>

          <label>Amount received</label>
          <input
            className="scan-input"
            value={received}
            onChange={(e) => setReceived(e.target.value)}
          />

          <div className="summary-card">
            <div><span>Total due</span><strong>{money(total)}</strong></div>
            <div><span>Change</span><strong>{money(change)}</strong></div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="soft" onClick={onClose}>Cancel</button>
          <button
            className="success"
            onClick={() => onConfirm({ method, received: Number(received || 0), change })}
          >
            Complete Payment
          </button>
        </div>
      </div>
    </div>
  );
}