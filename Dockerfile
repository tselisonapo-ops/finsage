FROM python:3.14-slim

# Install wkhtmltopdf
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

# Download and install wkhtmltopdf
RUN wget https://github.com/wkhtmltopdf/packaging/releases/download/0.12.6-1/wkhtmltox_0.12.6.1-1.buster_amd64.deb \
    && apt-get install -y ./wkhtmltox_0.12.6.1-1.buster_amd64.deb \
    && rm wkhtmltox_0.12.6.1-1.buster_amd64.deb


# Set workdir
WORKDIR /app

# Copy code
COPY . .

# Install Python dependencies
RUN pip install -r BackEnd/requirements.txt

# Start command
CMD ["gunicorn", "BackEnd.Services.api_server:app"]
