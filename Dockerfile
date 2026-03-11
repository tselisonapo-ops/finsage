FROM python:3.11-bullseye

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

COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Start Gunicorn
CMD ["/app/entrypoint.sh"]
