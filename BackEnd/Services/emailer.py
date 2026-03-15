# BackEnd/Services/emailer.py
from __future__ import annotations

from dotenv import load_dotenv
load_dotenv(override=False)

import os
import ssl
import smtplib
import mimetypes
from pathlib import Path
from email.message import EmailMessage
from typing import Optional, Iterable, Union, Tuple

# Attachment can be:
#  - a file path string
#  - (filename, bytes, mime_type)
Attachment = Union[str, Tuple[str, bytes, str]]


def _cfg():
    host = os.getenv("SMTP_HOST", "")
    port = int(os.getenv("SMTP_PORT", "465"))
    user = os.getenv("SMTP_USER", "")
    pwd = os.getenv("SMTP_PASS", "")
    mail_from = os.getenv("MAIL_FROM", user)
    return host, port, user, pwd, mail_from

def _ensure_config(host: str, user: str, pwd: str, mail_from: str):
    if not host or not user or not pwd or not mail_from:
        raise RuntimeError("SMTP not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS, MAIL_FROM.")

def _add_attachments(msg: EmailMessage, attachments: Optional[Iterable[Attachment]]):
    if not attachments:
        return

    for att in attachments:
        if isinstance(att, str):
            p = Path(att)
            if not p.exists():
                raise FileNotFoundError(f"Attachment file not found: {p}")

            data = p.read_bytes()
            mime, _ = mimetypes.guess_type(str(p))
            mime = mime or "application/octet-stream"
            maintype, subtype = mime.split("/", 1)

            msg.add_attachment(data, maintype=maintype, subtype=subtype, filename=p.name)

        else:
            filename, data, mime = att
            mime = mime or "application/octet-stream"
            maintype, subtype = mime.split("/", 1)
            msg.add_attachment(data, maintype=maintype, subtype=subtype, filename=filename)


def send_mail(
    *,
    to_email: str,
    subject: str,
    html_body: str,
    text_body: str = "",
    reply_to: Optional[str] = None,
    attachments: Optional[Iterable[Attachment]] = None,
    timeout: int = 20,
) -> None:
    host, port, user, pwd, mail_from = _cfg()
    _ensure_config(host, user, pwd, mail_from)

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = mail_from
    msg["To"] = to_email
    if reply_to:
        msg["Reply-To"] = reply_to

    msg.set_content(text_body or "View this email in an HTML-capable client.")
    msg.add_alternative(html_body or "<p>(no html body)</p>", subtype="html")

    _add_attachments(msg, attachments)

    try:
        if port == 465:
            with smtplib.SMTP_SSL(host, port, context=ssl.create_default_context(), timeout=timeout) as s:
                s.login(user, pwd)
                s.send_message(msg)
        else:
            with smtplib.SMTP(host, port, timeout=timeout) as s:
                s.ehlo()
                s.starttls(context=ssl.create_default_context())
                s.ehlo()
                s.login(user, pwd)
                s.send_message(msg)

    except Exception as e:
        raise RuntimeError(
            f"Email send failed: {type(e).__name__}: {e} (host={host} port={port} user={user} to={to_email})"
        ) from e