FROM python:3.12-slim
LABEL version="4"

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/
COPY symbols/ ./symbols/

# Secrets (OPENAI_API_KEY, TOGETHER_API_KEY, SLACK_FEEDBACK_WEBHOOK_URL, etc.)
# are injected at container runtime by the deploy platform (docker run -e,
# a k8s Secret, ...) — never baked into the image. pydantic-settings
# (app/config.py) reads process environment variables directly, so no code
# change is needed on top of this.

ENV ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173

RUN groupadd --system app && useradd --system --gid app --home /app app \
    && chown -R app:app /app
USER app

EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=5 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" || exit 1
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
