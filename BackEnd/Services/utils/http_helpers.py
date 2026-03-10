from flask import jsonify

def _opt():
    """Standard OPTIONS response for CORS preflight."""
    resp = jsonify({"ok": True})
    resp.status_code = 204
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return resp