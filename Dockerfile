FROM python:3.11-slim

# Avoid interactive prompts
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Africa/Maseru

# Install wkhtmltopdf and tzdata
RUN apt-get update && apt-get install -y --no-install-recommends \
    wkhtmltopdf \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

# Install dependencies
RUN pip install --upgrade pip \
    && pip install -r BackEnd/requirements.txt

# Start Gunicorn
CMD ["gunicorn", "BackEnd.Services.api_server:app"]
