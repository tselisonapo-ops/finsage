# BackEnd/Services/countries.py
import json
from pathlib import Path

DATA_FILE = Path(__file__).resolve().parent / "data" / "countries.json"

def load_countries():
    """
    Load all countries from countries.json.

    Expected JSON structure (either):
      - a list:
          [ { "code": "...", "iso3": "...", "name": "...", "currency": "...", "phone": "...", "flag": "..." }, ... ]
      - or an object:
          { "countries": [ ... ] }

    Returns:
      list[dict]
    """
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, list):
                return data
            return data.get("countries", [])
    except Exception as e:
        print(f"[countries.py] Failed to load countries.json: {e}")
        return []





