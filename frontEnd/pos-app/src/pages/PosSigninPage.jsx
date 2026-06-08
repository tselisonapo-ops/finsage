import { useState } from "react";
import { posApi } from "../services/posApi.js";

export function PosSigninPage() {
  const [employeeCode, setEmployeeCode] = useState("");
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState("");

  async function signIn(e) {
    e.preventDefault();

    if (!employeeCode || !pin) {
      setMessage("Enter employee ID and PIN.");
      return;
    }

    try {
      const res = await posApi.cashierSignin({
        employee_code: employeeCode,
        pin,
      });

        const employee = res.employee || res.cashier || res.data?.employee;
        const company = res.company || res.data?.company;

        localStorage.setItem("pos_token", res.pos_token || "");
        localStorage.setItem("pos_employee", JSON.stringify(employee));
        localStorage.setItem("pos_company", JSON.stringify(company));

      const industry = String(company?.industry || company?.industry_slug || "").toLowerCase();

      if (
        industry.includes("restaurant") ||
        industry.includes("food") ||
        industry.includes("cafe") ||
        industry.includes("bar")
      ) {
        window.location.hash = "#/orders";
      } else {
        window.location.hash = "#/cashier";
      }
    } catch (err) {
      setMessage(err.message || "POS sign-in failed.");
    }
  }

    return (
    <main className="signin-page">
        <form className="signin-card" onSubmit={signIn}>
        <h1>FinSage POS</h1>

        <p>Employee sign-in</p>

        {message && <div className="pos-message">{message}</div>}

        <label>Employee ID</label>
        <input
            className="scan-input"
            value={employeeCode}
            maxLength={5}
            placeholder="4 or 5 digit ID"
            onChange={(e) => setEmployeeCode(e.target.value.replace(/\D/g, ""))}
        />

        <label>PIN / Password</label>
        <input
            className="scan-input"
            type="password"
            value={pin}
            placeholder="Enter PIN"
            onChange={(e) => setPin(e.target.value)}
        />

        <button className="success" type="submit">
            Sign In
        </button>

        <button
            type="button"
            className="soft"
            onClick={() => (window.location.href = "/signin.html")}
        >
            Main FinSage Sign In
        </button>
        </form>
    </main>
    );
}