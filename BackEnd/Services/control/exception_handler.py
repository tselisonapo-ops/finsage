from __future__ import annotations

import logging
import traceback
from typing import Any, Optional

from flask import g, has_request_context, request


class ControlExceptionHandler(logging.Handler):
    def __init__(self, control_service):
        super().__init__(level=logging.ERROR)
        self.control_service = control_service
        self._capturing = False

    def emit(self, record: logging.LogRecord) -> None:
        if self._capturing or not record.exc_info:
            return

        if has_request_context() and getattr(
            g, "_control_error_already_recorded", False
        ):
            return

        try:
            self._capturing = True

            exc_value = record.exc_info[1]
            exception_type = (
                exc_value.__class__.__name__
                if exc_value is not None
                else "Exception"
            )

            message = record.getMessage()
            stack_trace = "".join(
                traceback.format_exception(*record.exc_info)
            )

            request_path = None
            http_method = None
            user_id = None
            company_id = None
            user_email = None

            context: dict[str, Any] = {
                "logger": record.name,
                "log_level": record.levelname,
                "log_message": message,
            }

            if has_request_context():
                request_path = request.path
                http_method = request.method

                context.update({
                    "request_path": request_path,
                    "http_method": http_method,
                    "endpoint": request.endpoint,
                })

                payload = getattr(request, "jwt_payload", None) or {}

                if isinstance(payload, dict):
                    raw_user_id = (
                        payload.get("user_id")
                        or payload.get("sub")
                        or payload.get("uid")
                    )
                    raw_company_id = (
                        payload.get("company_id")
                        or payload.get("company")
                        or payload.get("companyId")
                    )

                    user_email = (
                        payload.get("email")
                        or payload.get("user_email")
                    )

                    try:
                        if raw_user_id is not None:
                            user_id = int(raw_user_id)
                    except (TypeError, ValueError):
                        pass

                    try:
                        if raw_company_id is not None:
                            company_id = int(raw_company_id)
                    except (TypeError, ValueError):
                        pass

                    if raw_user_id is not None:
                        context["jwt_user_id"] = raw_user_id

                    if raw_company_id is not None:
                        context["jwt_company_id"] = raw_company_id

                    if user_email:
                        context["user_email"] = user_email

            event_code = (
                f"backend.exception:"
                f"{request_path or 'background'}:"
                f"{exception_type}:"
                f"{record.name or 'application'}"
            )

            self.control_service.record_system_error(
                event_code=event_code,
                severity="p2_high",
                source="flask.logging",
                product="finsage",
                company_id=company_id,
                user_id=user_id,
                user_email=user_email,
                message=message,
                exception_type=exception_type,
                stack_trace=stack_trace,
                context=context,
                request_path=request_path,
                http_method=http_method,
                http_status=500,
            )

        except Exception:
            pass
        finally:
            self._capturing = False