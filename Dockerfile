FROM python:3.11-bullseye

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Africa/Maseru

RUN apt-get update && apt-get install -y --no-install-recommends \
    wkhtmltopdf \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

RUN pip install --upgrade pip \
    && pip install -r BackEnd/requirements.txt

CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT} BackEnd.Services.api_server:app"]