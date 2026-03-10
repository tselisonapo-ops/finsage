# BackEnd/Services/reporting/statement_renderer.py

from typing import Dict, Any

def render_statement_html(stmt: Dict[str, Any]) -> str:
    """
    Generic statement-to-HTML renderer for v2 schemas (pnl/bs/cf/tb/notes).
    Accepts:
      - stmt["sections"] (pnl/cf/etc)
      - OR bs-v2 template shape: stmt["assets"] + stmt["liabilities_and_equity"]
    """

    stmt = stmt or {}
    meta = (stmt.get("meta") or {}) or {}
    st = meta.get("statement") or "statement"

    # ✅ ADAPTER: BS v2 template shape -> "sections" for renderer
    if st == "bs" and not stmt.get("sections"):
        stmt = {
            **stmt,
            "sections": [
                *(stmt.get("assets") or []),
                *(stmt.get("liabilities_and_equity") or []),
            ]
        }

    cols = stmt.get("columns") or [{"key": "cur", "label": "Amount"}]

    def esc(s):
        return (str(s or "")
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace('"', "&quot;")
                .replace("'", "&#039;"))

    def fmt(n):
        try:
            return f"{float(n or 0.0):,.2f}"
        except Exception:
            return "0.00"

    company = esc(meta.get("company_name") or "Company")

    title_map = {
        "pnl": "Statement of Profit or Loss",
        "bs":  "Statement of Financial Position",
        "cf":  "Statement of Cash Flows",
        "tb":  "Trial Balance",
        "notes": "Notes to the Financial Statements",
    }
    title = title_map.get(st, "Statement")

    # period text
    if st == "bs":
        period = f"As at {esc(meta.get('as_of') or '')}"
    else:
        per = meta.get("period") or {}
        period = f"For the period {esc(per.get('from') or '')} to {esc(per.get('to') or '')}"

    th = "".join([f"<th style='text-align:right;padding:6px 8px;border-bottom:1px solid #eee'>{esc(c.get('label'))}</th>" for c in cols])

    def row_cells(values, bold=False):
        tds = []
        for c in cols:
            v = values.get(c["key"], 0.0) if isinstance(values, dict) else 0.0
            style = "text-align:right;padding:6px 8px;border-bottom:1px solid #f3f4f6;"
            if bold:
                style += "font-weight:600;"
            tds.append(f"<td style='{style}'>{fmt(v)}</td>")
        return "".join(tds)

    html = f"""
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial; color:#0f172a">
    <div style="margin-bottom:12px">
        <div style="font-size:18px;font-weight:700">{company}</div>
        <div style="font-size:14px;font-weight:600;margin-top:2px">{esc(title)}</div>
        <div style="font-size:12px;color:#64748b;margin-top:2px">{esc(period)}</div>
    </div>
    """

    for sec in (stmt.get("sections") or []):
        html += f"""
        <div style="margin-bottom:14px">
        <div style="font-size:12px;font-weight:700;color:#475569;margin:6px 0">{esc(sec.get('label'))}</div>
        <div style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;background:#fff">
            <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead style="background:#f8fafc;color:#475569">
                <tr>
                <th style="text-align:left;padding:6px 8px;border-bottom:1px solid #eee">Description</th>
                {th}
                </tr>
            </thead>
            <tbody>
        """

        for ln in (sec.get("lines") or []):
            # CF DETAIL block
            if st == "cf" and ln.get("code") == "DETAIL" and isinstance(ln.get("detail"), dict):
                html += f"""
                <tr>
                <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;font-weight:600">{esc(ln.get("name") or "Details")}</td>
                {row_cells(ln.get("values") or {}, bold=True)}
                </tr>
                """
                cur_lines = (ln.get("detail") or {}).get("cur") or []
                if cur_lines:
                    html += f"""
                    <tr>
                    <td colspan="{1+len(cols)}" style="padding:8px;border-top:1px solid #f3f4f6">
                        <table style="width:100%;border-collapse:collapse;font-size:11px">
                        <thead style="background:#f8fafc;color:#475569">
                            <tr>
                            <th style="text-align:left;padding:6px 6px;border-bottom:1px solid #eee">Date</th>
                            <th style="text-align:left;padding:6px 6px;border-bottom:1px solid #eee">Ref</th>
                            <th style="text-align:left;padding:6px 6px;border-bottom:1px solid #eee">Description</th>
                            <th style="text-align:left;padding:6px 6px;border-bottom:1px solid #eee">Account</th>
                            <th style="text-align:right;padding:6px 6px;border-bottom:1px solid #eee">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                    """
                    for d in cur_lines[:500]:
                        html += f"""
                        <tr>
                        <td style="padding:6px 6px;border-bottom:1px solid #f3f4f6">{esc(d.get("date"))}</td>
                        <td style="padding:6px 6px;border-bottom:1px solid #f3f4f6">{esc(d.get("ref"))}</td>
                        <td style="padding:6px 6px;border-bottom:1px solid #f3f4f6">{esc(d.get("description") or d.get("memo"))}</td>
                        <td style="padding:6px 6px;border-bottom:1px solid #f3f4f6">{esc(d.get("account_name") or d.get("account"))}</td>
                        <td style="padding:6px 6px;border-bottom:1px solid #f3f4f6;text-align:right">{fmt(d.get("amount"))}</td>
                        </tr>
                        """
                    html += "</tbody></table></td></tr>"
                continue

            html += f"""
            <tr>
                <td style="padding:6px 8px;border-bottom:1px solid #f3f4f6">{esc((ln.get("code") or "") + (" — " if ln.get("code") else "") + (ln.get("name") or ""))}</td>
                {row_cells(ln.get("values") or {})}
            </tr>
            """

        html += f"""
            <tr style="background:#f8fafc;font-weight:700">
                <td style="padding:6px 8px;border-top:1px solid #eee">{esc(sec.get('label'))} total</td>
                {row_cells(sec.get("totals") or {}, bold=True)}
            </tr>
            </tbody>
            </table>
        </div>
        </div>
        """

    if st == "cf" and stmt.get("net_change"):
        html += f"""
        <div style="margin-top:10px;padding:10px;border:1px solid #e5e7eb;border-radius:10px;background:#f8fafc;font-weight:700;display:flex;justify-content:space-between">
        <span>{esc(stmt["net_change"].get("label") or "Net change")}</span>
        <span>{fmt((stmt["net_change"].get("values") or {}).get("cur"))}</span>
        </div>
        """

    html += "</div>"
    return html
