FROM ubuntu:20.04

# Install Python and wkhtmltopdf
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    wkhtmltopdf \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .
RUN pip install -r BackEnd/requirements.txt

CMD ["gunicorn", "BackEnd.Services.api_server:app"]
