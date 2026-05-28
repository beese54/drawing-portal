FROM python:3.12-slim
LABEL version="2"

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/
COPY symbols/ ./symbols/

ENV ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173,https://spd-fe-2.app.tc1.airbase.sg

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
