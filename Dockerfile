FROM ubuntu:20.04

# Avoid interactive prompts
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Africa/Maseru

# Install Python, wkhtmltopdf, and tzdata without recommended extras
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    wkhtmltopdf \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .
RUN pip install -r BackEnd/requirements.txt

CMD ["gunicorn", "BackEnd.Services.api_server:app"]
