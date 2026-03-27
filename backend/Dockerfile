FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app:/app/services/core-runtime:/app/services/engine-proxy

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates gnupg \
  && rm -rf /var/lib/apt/lists/*

# Node.js runtime (needed for npx remotion and other Node-based skills)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
  && apt-get update && apt-get install -y --no-install-recommends nodejs \
  && rm -rf /var/lib/apt/lists/* \
  && node -v && npm -v && npx -v

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

COPY . /app

EXPOSE 8000

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--timeout-keep-alive", "300"]
