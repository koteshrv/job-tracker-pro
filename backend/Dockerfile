# Use the official Microsoft Playwright image which includes Chromium
FROM mcr.microsoft.com/playwright:v1.44.0-jammy

WORKDIR /app

# Install Python, pip, and LaTeX dependencies
RUN apt-get update && apt-get install -y python3 python3-pip texlive-latex-base texlive-fonts-recommended texlive-latex-extra texlive-fonts-extra && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# Create necessary directories
RUN mkdir -p /app/backend

# Copy backend source
COPY backend/ ./backend/
COPY targets.json keywords.json ./

EXPOSE 8000

CMD ["python3", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
