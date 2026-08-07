# BGE-M3 FAQ Service

A Python microservice that uses **BGE-M3** (`BAAI/bge-m3`) to semantically match user queries against the FAQ knowledge base.

## Why BGE-M3?

BGE-M3 is a state-of-the-art multilingual embedding model developed by BAAI. It supports:
- **Multilingual Excellence**: Exceptional accuracy for Vietnamese and English.
- **Dense Retrieval**: 1024-dimensional normalized dense vectors.
- **Long Context**: Up to 8192 tokens max length.

## Architecture & Retrieval Tiers

```
User Message
    │
    ▼
[1] Keyword Match       ← faqParser.ts          (0 ms, exact match)
    │  no match
    ▼
[2] BGE-M3 Semantic     ← bgeM3Client.ts → THIS SERVICE  (port 5051)
    │  below threshold / service down
    ▼
[3] PhoBERT Semantic    ← phobertClient.ts → PhoBERT SERVICE (port 5050)
    │  below threshold / service down
    ▼
[4] Gemini Embeddings   ← vectorStore.json      (cloud fallback)
    │  below threshold
    ▼
[5] Default Reply
```

## Setup & Running

### Windows (using short-path venv `C:\pb`)

```bat
cd bge-m3-service
C:\pb\Scripts\pip install -r requirements.txt
start-bge-m3.bat
```

### Docker / Docker Compose

```bash
docker compose up -d --build
```

## Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Service status, model name, FAQ count |
| `POST` | `/match` | Match user query against FAQ |
| `POST` | `/embed` | Get 1024-dim BGE-M3 embedding |
| `POST` | `/reload` | Reload FAQ index from `faq.md` |
| `POST` | `/debug-scores` | View top 10 similarity scores for a query |
