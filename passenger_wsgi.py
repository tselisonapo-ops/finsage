import sys
import os

PROJECT_ROOT = os.path.dirname(__file__)
sys.path.insert(0, PROJECT_ROOT)

from BackEnd.Services.api_server import app as application