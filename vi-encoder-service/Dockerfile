FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy service code
COPY main.py ./

# Environment defaults
ENV BGEM3_MODEL=BAAI/bge-m3
ENV BGEM3_THRESHOLD=0.70
ENV BGEM3_FAQ_PATH=/app/data/knowledge-base/faq.md
ENV PYTHONUNBUFFERED=1

EXPOSE 5051

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5051"]
