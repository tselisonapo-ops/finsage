import hashlib
import re

def _norm(s):
    if not s:
        return ""
    s = s.lower().strip()
    s = re.sub(r"\s+", " ", s)        # collapse spaces
    s = re.sub(r"[^\w\s\-/#]", "", s) # remove noise
    return s

def fingerprint_line(line_date, amount, description, reference, running_balance=None) -> str:
    # include running_balance if you have it (makes duplicates even less likely)
    s = f"{line_date}|{amount}|{_norm(description)}|{_norm(reference)}|{running_balance or ''}"
    return hashlib.sha1(s.encode("utf-8")).hexdigest()

