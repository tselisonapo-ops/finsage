from __future__ import annotations

import json
import logging
import sys
from pathlib import Path
from datetime import datetime


LOG_DIR = Path(__file__).resolve().parents[1] / "reports"
LOG_DIR.mkdir(parents=True, exist_ok=True)

LOG_FILE = LOG_DIR / "qa_bot.log"
JSONL_FILE = LOG_DIR / "qa_bot_events.jsonl"


def get_logger(name: str = "qa-bot") -> logging.Logger:
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger

    logger.setLevel(logging.INFO)

    formatter = logging.Formatter(
        fmt="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    stream_handler = logging.StreamHandler(sys.stdout)
    stream_handler.setFormatter(formatter)
    logger.addHandler(stream_handler)

    file_handler = logging.FileHandler(LOG_FILE, encoding="utf-8")
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)

    return logger


logger = get_logger()


def log_event(event_type: str, **payload) -> None:
    row = {
        "ts": datetime.utcnow().isoformat() + "Z",
        "event_type": event_type,
        **payload,
    }
    with JSONL_FILE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")