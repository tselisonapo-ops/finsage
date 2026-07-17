import os
import sys
import traceback

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))

if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

print(
    f"[PASSENGER] Starting application from {PROJECT_ROOT}",
    flush=True,
)

try:
    from BackEnd.Services.api_server import app as flask_app

    print(
        "[PASSENGER] Flask application imported successfully",
        flush=True,
    )

except Exception:
    print(
        "[PASSENGER] Failed to import Flask application",
        flush=True,
    )
    traceback.print_exc()
    raise


class RestoreApiPrefixMiddleware:
    def __init__(self, app, mount_prefix="/api"):
        self.app = app
        self.mount_prefix = mount_prefix.rstrip("/")

    def __call__(self, environ, start_response):
        try:
            script_name = environ.get("SCRIPT_NAME") or ""
            path_info = environ.get("PATH_INFO") or ""
            request_method = environ.get("REQUEST_METHOD") or ""

            print(
                "[PASSENGER REQUEST] "
                f"method={request_method} "
                f"SCRIPT_NAME={script_name!r} "
                f"PATH_INFO={path_info!r}",
                flush=True,
            )

            normalized_script = script_name.rstrip("/")

            # Passenger may expose SCRIPT_NAME as either /api or /api/.
            if (
                normalized_script == self.mount_prefix
                and not path_info.startswith(self.mount_prefix + "/")
                and path_info != self.mount_prefix
            ):
                new_path = self.mount_prefix + (
                    path_info if path_info.startswith("/") else "/" + path_info
                )

                print(
                    f"[PASSENGER REQUEST] Restoring path "
                    f"{path_info!r} -> {new_path!r}",
                    flush=True,
                )

                environ["PATH_INFO"] = new_path

            return self.app(environ, start_response)

        except Exception:
            print(
                "[PASSENGER] Unhandled middleware exception",
                flush=True,
            )
            traceback.print_exc()
            raise


application = RestoreApiPrefixMiddleware(
    flask_app,
    mount_prefix="/api",
)

print(
    "[PASSENGER] WSGI application ready",
    flush=True,
)