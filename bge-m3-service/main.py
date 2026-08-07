"""
BGE-M3 FAQ Matching Microservice
=================================
Loads all FAQ items from data/knowledge-base/faq.md at startup,
encodes each sample question with BAAI/bge-m3 (state-of-the-art multilingual embedding model),
and exposes a /match endpoint that returns the best-matched answer
for a user query (Vietnamese & English).

Run:
    pip install -r requirements.txt
    uvicorn main:app --port 5051 --reload
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path
from typing import Optional

# Fix Windows console encoding so UTF-8 characters print cleanly
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf8"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if sys.stderr.encoding and sys.stderr.encoding.lower() not in ("utf-8", "utf8"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from fastapi import FastAPI
from pydantic import BaseModel
import torch
from sentence_transformers import SentenceTransformer

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

MODEL_NAME = os.getenv("BGEM3_MODEL", "BAAI/bge-m3")
SIMILARITY_THRESHOLD = float(os.getenv("BGEM3_THRESHOLD", "0.70"))
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

_env_faq = os.getenv("BGEM3_FAQ_PATH", "")
if _env_faq:
    FAQ_PATH = Path(_env_faq)
else:
    FAQ_PATH = Path(__file__).resolve().parent.parent / "data" / "knowledge-base" / "faq.md"

# ---------------------------------------------------------------------------
# Load model once at startup
# ---------------------------------------------------------------------------

print(f"[bge-m3-service] Loading model '{MODEL_NAME}' on {DEVICE} ...")
model = SentenceTransformer(MODEL_NAME, device=DEVICE)
print("[bge-m3-service] Model loaded successfully.")

# ---------------------------------------------------------------------------
# FAQ parser
# ---------------------------------------------------------------------------

def load_faq_items() -> list[dict]:
    """Parse faq.md into a list of {topic, questions, answer} dicts."""
    if not FAQ_PATH.exists():
        print(f"[bge-m3-service] WARNING: FAQ file not found at {FAQ_PATH}")
        return []

    content = FAQ_PATH.read_text(encoding="utf-8")
    blocks = re.split(r"\n\s*\n(?=[A-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝĂĐƠƯ])", content)

    items: list[dict] = []
    for block in blocks:
        lines = [l.strip() for l in block.strip().splitlines() if l.strip()]
        if not lines:
            continue
        topic = lines[0]
        questions: list[str] = []
        answer_lines: list[str] = []
        collecting_q = False
        collecting_a = False

        for line in lines[1:]:
            if re.match(r"^(?:Áp dụng|Nếu) (?:khi )?khách (?:hỏi|báo)?:", line, re.IGNORECASE):
                collecting_q = True
                collecting_a = False
                continue
            if re.match(r"^Chatbot\s*(?:trả lời)?:", line, re.IGNORECASE):
                collecting_q = False
                collecting_a = True
                continue
            if collecting_q:
                questions.append(line)
            elif collecting_a:
                answer_lines.append(line)

        answer = "\n".join(answer_lines).strip()
        if answer:
            items.append({"topic": topic, "questions": questions, "answer": answer})

    return items

# ---------------------------------------------------------------------------
# Pre-compute FAQ embeddings
# ---------------------------------------------------------------------------

class FaqEntry:
    def __init__(self, topic: str, question: str, answer: str, embedding: torch.Tensor):
        self.topic = topic
        self.question = question
        self.answer = answer
        self.embedding = embedding  # shape (1024,)


def encode(texts: list[str]) -> torch.Tensor:
    """Return normalized dense embeddings using BGE-M3."""
    embeddings = model.encode(
        texts,
        normalize_embeddings=True,
        convert_to_tensor=True,
        device=DEVICE,
    )
    return embeddings


def build_faq_index(items: list[dict]) -> list[FaqEntry]:
    entries: list[FaqEntry] = []
    all_questions: list[tuple[str, str, str]] = []

    for item in items:
        for q in item["questions"]:
            all_questions.append((item["topic"], q, item["answer"]))
        all_questions.append((item["topic"], item["topic"], item["answer"]))

    if not all_questions:
        return entries

    texts = [q for _, q, _ in all_questions]
    print(f"[bge-m3-service] Encoding {len(texts)} FAQ question(s)...")
    embeddings = encode(texts)

    for i, (topic, question, answer) in enumerate(all_questions):
        entries.append(FaqEntry(
            topic=topic,
            question=question,
            answer=answer,
            embedding=embeddings[i],
        ))

    print(f"[bge-m3-service] FAQ index built: {len(entries)} entries.")
    return entries


faq_items = load_faq_items()
faq_index = build_faq_index(faq_items)

# ---------------------------------------------------------------------------
# FastAPI App
# ---------------------------------------------------------------------------

app = FastAPI(title="BGE-M3 FAQ Service", version="1.0.0")


class MatchRequest(BaseModel):
    query: str
    threshold: Optional[float] = None


class MatchResponse(BaseModel):
    matched: bool
    answer: str
    topic: str
    question: str
    score: float


class EmbedRequest(BaseModel):
    text: str


class EmbedResponse(BaseModel):
    embedding: list[float]


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model": MODEL_NAME,
        "faq_entries": len(faq_index),
        "device": DEVICE,
    }


@app.post("/match", response_model=MatchResponse)
def match_faq(req: MatchRequest):
    """
    Find the best-matching FAQ answer for a query using BGE-M3 dense embeddings.
    """
    threshold = req.threshold if req.threshold is not None else SIMILARITY_THRESHOLD

    if not faq_index:
        return MatchResponse(matched=False, answer="", topic="", question="", score=0.0)

    query_emb = encode([req.query])[0]

    best_score = -1.0
    best_entry: Optional[FaqEntry] = None

    for entry in faq_index:
        score = float(torch.dot(query_emb, entry.embedding).item())
        if score > best_score:
            best_score = score
            best_entry = entry

    if best_entry is None or best_score < threshold:
        return MatchResponse(matched=False, answer="", topic="", question="", score=best_score)

    return MatchResponse(
        matched=True,
        answer=best_entry.answer,
        topic=best_entry.topic,
        question=best_entry.question,
        score=best_score,
    )


@app.post("/embed", response_model=EmbedResponse)
def embed_text(req: EmbedRequest):
    """Return the BGE-M3 embedding vector (1024-dim) for a text."""
    emb = encode([req.text])[0]
    return EmbedResponse(embedding=emb.cpu().tolist())


@app.post("/reload")
def reload_faq():
    """Hot-reload the FAQ index without restarting."""
    global faq_items, faq_index
    faq_items = load_faq_items()
    faq_index = build_faq_index(faq_items)
    return {"status": "reloaded", "faq_entries": len(faq_index)}


@app.post("/debug-scores")
def debug_scores(req: MatchRequest):
    """Return top 10 FAQ entries ranked by BGE-M3 similarity score."""
    if not faq_index:
        return {"error": "FAQ index is empty", "faq_path": str(FAQ_PATH), "path_exists": FAQ_PATH.exists()}

    query_emb = encode([req.query])[0]
    results = []
    for entry in faq_index:
        score = float(torch.dot(query_emb, entry.embedding).item())
        results.append({
            "score": round(score, 4),
            "topic": entry.topic,
            "question": entry.question,
        })

    results.sort(key=lambda x: x["score"], reverse=True)
    return {
        "query": req.query,
        "model": MODEL_NAME,
        "threshold": req.threshold or SIMILARITY_THRESHOLD,
        "total_entries": len(faq_index),
        "results": results[:10],
    }
