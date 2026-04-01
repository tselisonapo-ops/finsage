from __future__ import annotations

from api.base_flow import BaseFlow


class PlaceholderFlow(BaseFlow):
    @property
    def name(self) -> str:
        return "placeholder_flow"

    def run(self) -> dict:
        return {"ok": True, "message": "Not implemented yet"}