FROM python:3.14-slim

# Install dependencies
RUN apt-get update && apt-get install -y \
    wget \
    xfonts-base \
    xfonts-75dpi \
    libjpeg62-turbo \
    libx11-6 \
    libxcb1 \
    libxext6 \
    libxrender1 \
    libssl3 \
    libpng16-16 \
    libfontconfig1 \
    && rm -rf /var/lib/apt/lists/*

# Download and install wkhtmltopdf binary
RUN wget https://github.com/wkhtmltopdf/wkhtmltopdf/releases/download/0.12.6.1/wkhtmltox-0.12.6.1_linux-generic-amd64.tar.xz \
    && tar -xf wkhtmltox-0.12.6.1_linux-generic-amd64.tar.xz \
    && cp wkhtmltox/bin/wkhtmltopdf /usr/local/bin/ \
    && rm -rf wkhtmltox wkhtmltox-0.12.6.1_linux-generic-amd64.tar.xz

WORKDIR /app
COPY . .
RUN pip install -r BackEnd/requirements.txt

CMD ["gunicorn", "BackEnd.Services.api_server:app"]
