# Use the official Microsoft Playwright image
FROM mcr.microsoft.com/playwright/python:v1.44.0-jammy

# Install Xvfb (Virtual Framebuffer) and SQLite3
RUN apt-get update && apt-get install -y xvfb sqlite3 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the application code
COPY . .

# Set the display environment variable
ENV DISPLAY=:99

# Start the X virtual framebuffer in the background, then run Python unbuffered
CMD Xvfb :99 -screen 0 1280x1024x24 & python -u scraper.py
