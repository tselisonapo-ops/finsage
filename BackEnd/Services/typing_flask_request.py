from typing import Any, Dict, Optional
from flask import Request

# Monkey typing: tell your editor Request has jwt_payload
Request.jwt_payload: Dict[str, Any]  # type: ignore[attr-defined]
