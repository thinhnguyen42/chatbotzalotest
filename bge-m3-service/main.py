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
SIMILARITY_THRESHOLD = float(os.getenv("BGEM3_THRESHOLD", "0.60"))
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

_env_faq = os.getenv("BGEM3_FAQ_PATH", "")
if _env_faq and Path(_env_faq).exists():
    FAQ_PATH = Path(_env_faq)
else:
    FAQ_PATH = Path(__file__).resolve().parent.parent / "data" / "knowledge-base" / "faq.md"

print(f"[bge-m3-service] FAQ Path: {FAQ_PATH} (exists: {FAQ_PATH.exists()})")

# ---------------------------------------------------------------------------
# Load model once at startup
# ---------------------------------------------------------------------------

print(f"[bge-m3-service] Loading model '{MODEL_NAME}' on {DEVICE} ...")
model = SentenceTransformer(MODEL_NAME, device=DEVICE)
print("[bge-m3-service] Model loaded successfully.")

# ---------------------------------------------------------------------------
# Vietnamese normalization (restore diacritics from unaccented input)
# ---------------------------------------------------------------------------

# Common unaccented Vietnamese -> accented mapping (word-level)
_VI_WORD_MAP: dict[str, str] = {
    # địa điểm
    "dia chi": "địa chỉ", "vi tri": "vị trí", "ban do": "bản đồ",
    "toa nha": "tòa nhà", "o dau": "ở đâu", "chi duong": "chỉ đường",
    # chi phí
    "phi dich vu": "phí dịch vụ", "dich vu": "dịch vụ",
    "chi phi": "chi phí", "tien dien": "tiền điện", "tien nuoc": "tiền nước",
    "hang thang": "hàng tháng", "phi xe": "phí xe",
    # wifi
    "mat khau": "mật khẩu", "wifi": "wifi", "ten wifi": "tên wifi",
    "pass wifi": "pass wifi", "internet": "internet",
    # thanh toán
    "thanh toan": "thanh toán", "chuyen khoan": "chuyển khoản",
    "tien mat": "tiền mặt", "cu phap": "cú pháp",
    # nội quy
    "noi quy": "nội quy", "quy dinh": "quy định", "pccc": "pccc",
    "phong chay": "phòng cháy",
    # thú cưng
    "thu cung": "thú cưng", "nuoi meo": "nuôi mèo", "nuoi cho": "nuôi chó",
    "nuoi pet": "nuôi pet", "con meo": "con mèo", "con cho": "con chó",
    # đỗ xe
    "gui xe": "gửi xe", "xe may": "xe máy", "do xe": "đỗ xe",
    "bai do xe": "bãi đỗ xe",
    # sửa chữa
    "bao hong": "báo hỏng", "bao tri": "bảo trì", "su co": "sự cố",
    "may lanh": "máy lạnh", "may giat": "máy giặt", "tu lanh": "tủ lạnh",
    "khoa cua": "khóa cửa", "ro ri": "rò rỉ",
    # thuê phòng / trả phòng
    "thue phong": "thuê phòng", "phong trong": "phòng trống",
    "xem phong": "xem phòng", "tra phong": "trả phòng",
    "hoan coc": "hoàn cọc", "tra coc": "trả cọc",
    "ban giao phong": "bàn giao phòng",
    # gia hạn
    "gia han": "gia hạn", "han hop dong": "hạn hợp đồng",
    # liên hệ / khẩn cấp
    "hotline": "hotline", "lien he": "liên hệ",
    "khan cap": "khẩn cấp", "chay nha": "cháy nhà",
    "chap dien": "chập điện",
    # quên mật khẩu
    "quen mat khau": "quên mật khẩu", "mat the": "mất thẻ",
    "mat chia khoa": "mất chìa khóa",
    # nội thất
    "noi that": "nội thất", "may giat": "máy giặt",
    # người ở
    "so nguoi": "số người", "may nguoi": "mấy người", "nguoi o": "người ở",
}


def normalize_vietnamese(text: str) -> str:
    """
    Detect if text is unaccented Vietnamese (no diacritics beyond basic ASCII+đ)
    and restore common words to their proper accented form using a lookup table.
    Matching is done on multi-word phrases first (longest match first).
    """
    # Check if text already has Vietnamese diacritics — if so, return as-is
    has_diacritics = bool(re.search(
        r'[àáâãèéêìíòóôõùúýăđơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỷỹỵ'
        r'ÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝĂĐƠƯẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼẾỀỂỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪỬỮỰỲỶỸỴ]',
        text
    ))
    if has_diacritics:
        return text

    # Sort by phrase length (longest first) to match multi-word phrases greedily
    lowered = text.lower()
    result = lowered
    for unaccented, accented in sorted(_VI_WORD_MAP.items(), key=lambda x: -len(x[0])):
        result = re.sub(r'\b' + re.escape(unaccented) + r'\b', accented, result)

    return result


# ---------------------------------------------------------------------------
# FAQ parser
# ---------------------------------------------------------------------------

def load_faq_items() -> list[dict]:
    """Parse faq.md into a list of {topic, questions, answer} dicts.
    
    Splits the file into sections by detecting lines that look like topic headers:
    a non-indented line immediately after a blank line that is NOT 'Chatbot:', 'Áp dụng...' etc.
    """
    if not FAQ_PATH.exists():
        print(f"[bge-m3-service] WARNING: FAQ file not found at {FAQ_PATH}")
        return []

    content = FAQ_PATH.read_text(encoding="utf-8")
    lines = content.splitlines()

    # Split into raw sections: a section starts when we see a non-empty line
    # that is NOT a sub-header (Áp dụng / Chatbot) and follows a blank line.
    SKIP_PREFIXES = ("Áp dụng", "Nếu khi", "Chatbot", "-", "1.", "2.", "3.", "4.", "5.", "6.", "7.", "8.", " ")

    sections: list[list[str]] = []
    current: list[str] = []

    for line in lines:
        stripped = line.strip()
        if not stripped:
            # blank line → could be a section boundary
            if current:
                current.append("")
            continue

        # Detect if this is a new topic header:
        #  - non-empty
        #  - previous context has a blank line
        #  - does NOT start with known sub-prefixes
        #  - previous block has content
        is_new_topic = (
            current and
            current[-1] == "" and  # last line was blank
            not any(stripped.startswith(p) for p in SKIP_PREFIXES) and
            not re.match(r"^Chatbot\s*(?:trả lời)?:", stripped, re.IGNORECASE) and
            not re.match(r"^(?:Áp dụng|Nếu) ", stripped, re.IGNORECASE)
        )

        if is_new_topic:
            sections.append([l for l in current if l or any(ll.strip() for ll in current)])
            current = [stripped]
        else:
            current.append(stripped)

    if current:
        sections.append(current)

    items: list[dict] = []
    for section in sections:
        # Remove trailing/leading blank lines
        while section and not section[0]:
            section.pop(0)
        while section and not section[-1]:
            section.pop()
        if not section:
            continue

        topic = section[0]
        questions: list[str] = []
        answer_lines: list[str] = []
        collecting_q = False
        collecting_a = False

        for line in section[1:]:
            if not line:
                if collecting_a:
                    answer_lines.append("")
                continue
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
    Automatically normalizes unaccented Vietnamese input before embedding.
    """
    threshold = req.threshold if req.threshold is not None else SIMILARITY_THRESHOLD

    if not faq_index:
        return MatchResponse(matched=False, answer="", topic="", question="", score=0.0)

    # Normalize unaccented Vietnamese -> accented form for better embedding quality
    normalized_query = normalize_vietnamese(req.query)
    queries_to_try = [req.query]
    if normalized_query != req.query:
        queries_to_try.append(normalized_query)
        print(f"[bge-m3] Normalized: '{req.query}' -> '{normalized_query}'")

    best_score = -1.0
    best_entry: Optional[FaqEntry] = None

    for q in queries_to_try:
        query_emb = encode([q])[0]
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

    normalized_query = normalize_vietnamese(req.query)
    query_emb = encode([normalized_query])[0]
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
