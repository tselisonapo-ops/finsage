import sys
import os

PROJECT_ROOT = os.path.dirname(__file__)
sys.path.insert(0, PROJECT_ROOT)

from BackEnd.Services.api_server import app as flask_app


class RestoreApiPrefixMiddleware:
    def __init__(self, app, mount_prefix="/api"):
        self.app = app
        self.mount_prefix = mount_prefix

    def __call__(self, environ, start_response):
        script_name = environ.get("SCRIPT_NAME", "")
        path_info = environ.get("PATH_INFO", "")

        # Passenger mounted at /api strips that prefix before Flask sees it.
        # Put it back so existing Flask routes like /api/auth/... still match.
        if script_name == self.mount_prefix and not path_info.startswith(self.mount_prefix):
            environ["PATH_INFO"] = self.mount_prefix + path_info

        return self.app(environ, start_response)


application = RestoreApiPrefixMiddleware(flask_app, mount_prefix="/api")