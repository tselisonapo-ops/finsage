from __future__ import annotations

from api.base_flow import BaseFlow


class BillFlow(BaseFlow):
    @property
    def name(self) -> str:
        return "bill_flow"

    def run(self) -> dict:
        return {"ok": True, "message": "Bill flow not implemented yet"}