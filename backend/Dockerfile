FROM python:3.11-slim

# Install system dependencies for WeasyPrint, Node.js (for mmdc/Mermaid CLI),
# and the headless Chromium runtime libraries Puppeteer (used internally by
# mmdc) needs.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3-dev \
    python3-pip \
    curl \
    gnupg \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf-2.0-0 \
    libffi-dev \
    shared-mime-info \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    fonts-liberation \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install mmdc (Mermaid CLI) for local, privacy-preserving diagram rendering
# (Requirement 11.1). DiagramRenderingService automatically falls back to the
# Kroki API if mmdc is ever unavailable at runtime, so this is not a hard
# dependency for the app to function -- just the preferred path.
RUN npm install -g @mermaid-js/mermaid-cli@10

# Puppeteer's bundled Chromium needs --no-sandbox inside most containers
# (the default sandbox requires privileges this container doesn't have).
# MMDC_PUPPETEER_CONFIG (read by DiagramRenderingService.render_with_mmdc)
# points mmdc at this config; unset in local/non-container dev, where the
# default sandbox works fine.
RUN echo '{"args": ["--no-sandbox", "--disable-setuid-sandbox"]}' > /etc/puppeteer-config.json
ENV MMDC_PUPPETEER_CONFIG=/etc/puppeteer-config.json

# Set working directory
WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install psycopg2 for PostgreSQL
RUN pip install --no-cache-dir psycopg2-binary

# Copy application code
COPY . .

# Create output directory for PDFs
RUN mkdir -p /tmp/doc-output

# Expose port
EXPOSE 8000

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
