FROM ubuntu:20.04

# Set environment variables to avoid tzdata prompt
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Africa/Maseru

# Install Python, wkhtmltopdf, and tzdata
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    wkhtmltopdf \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .
RUN pip install -r BackEnd/requirements.txt

CMD ["gunicorn", "BackEnd.Services.api_server:app"]
