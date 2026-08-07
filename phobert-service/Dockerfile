FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy microservice code
COPY main.py ./

# Environment defaults
ENV PHOBERT_MODEL=vinai/phobert-base
ENV PHOBERT_THRESHOLD=0.80
ENV PHOBERT_FAQ_PATH=/app/data/knowledge-base/faq.md
ENV PYTHONUNBUFFERED=1

EXPOSE 5050

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5050"]
