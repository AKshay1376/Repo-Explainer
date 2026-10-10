FROM node:22-alpine AS frontend-build
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 APP_ENV=production DATA_DIR=/data PORT=10000
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -g 10001 repo && useradd -u 10001 -g repo -m repo \
    && mkdir -p /data && chown repo:repo /data
COPY requirements.lock /app/requirements.lock
RUN pip install --no-cache-dir -r requirements.lock
COPY . /app
COPY --from=frontend-build /build/frontend/dist /app/frontend/dist
RUN chown -R repo:repo /app
USER repo
EXPOSE 10000
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:'+os.getenv('PORT','10000')+'/api/health',timeout=3)" || exit 1
CMD ["gunicorn", "-c", "gunicorn.conf.py", "web_app:app"]
