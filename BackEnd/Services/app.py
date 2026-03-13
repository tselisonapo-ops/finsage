import os
from dotenv import load_dotenv

app_env = os.getenv("APP_ENV", "development").strip().lower()

# Only load dotenv files outside production
if app_env != "production":
    load_dotenv(".env")
    load_dotenv(".env.development", override=False)