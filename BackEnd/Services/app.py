import os
from dotenv import load_dotenv

app_env = os.getenv("APP_ENV", "development").strip().lower()

# base .env first
load_dotenv(".env")

# then environment-specific override
if app_env == "production":
    load_dotenv(".env.production", override=True)
else:
    load_dotenv(".env.development", override=True)