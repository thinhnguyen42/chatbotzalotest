import os
import re
import glob
from typing import List, Optional
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import torch
from transformers import AutoTokenizer, AutoModel
import numpy as np

app = FastAPI(title="PhoBERT FAQ Microservice")

MODEL_NAME = "vinai/phobert-base"
KB_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "knowledge-base")
DEFAULT_THRESHOLD = 0.65

tokenizer = None
model = None
faq_questions = [] # list of {"topic": str, "question": str, "answer": str, "embedding": np.ndarray}

def mean_pooling(model_output, attention_mask):
    token_embeddings = model_output[0]
    input_mask_expanded = attention_mask.unsqueeze(-1).expand(token_embeddings.size()).float()
    return torch.sum(token_embeddings * input_mask_expanded, 1) / torch.clamp(input_mask_expanded.sum(1), min=1e-9)

def encode_texts(texts: List[str]) -> np.ndarray:
    encoded_input = tokenizer(texts, padding=True, truncation=True, max_length=256, return_tensors='pt')
    with torch.no_grad():
        model_output = model(**encoded_input)
    sentence_embeddings = mean_pooling(model_output, encoded_input['attention_mask'])
    # Normalize embeddings
    sentence_embeddings = sentence_embeddings / torch.norm(sentence_embeddings, dim=1, keepdim=True)
    return sentence_embeddings.numpy()

def parse_faq_md() -> List[dict]:
    items = []
    faq_path = os.path.join(KB_DIR, "faq.md")
    if not os.path.exists(faq_path):
        return items

    with open(faq_path, "r", encoding="utf-8") as f:
        content = f.read()

    blocks = re.split(r'\n\s*\n(?=[A-ZÀ-Ỹ][^\n]{1,40}\n(?:Áp dụng|Nếu|Nguyên tắc))', content)
    for block in blocks:
        trimmed = block.strip()
        if not trimmed:
            continue
        lines = [l.strip() for l in trimmed.split("\n") if l.strip()]
        topic = lines[0] if lines else ""

        questions = []
        answer_lines = []
        is_q = False
        is_a = False

        for line in lines[1:]:
            if re.search(r'^(?:Áp dụng|Nếu) (?:khi )?khách (?:hỏi|báo)?:', line, re.I):
                is_q = True
                is_a = False
                continue
            if re.search(r'^Chatbot\s*(?:trả lời)?:', line, re.I):
                is_q = False
                is_a = True
                continue

            if is_q:
                questions.append(line)
            elif is_a:
                answer_lines.append(line)

        answer = "\n".join(answer_lines).strip()
        if answer and questions:
            for q in questions:
                items.append({"topic": topic, "question": q, "answer": answer})
    return items

def build_faq_index():
    global faq_questions
    raw_items = parse_faq_md()
    if not raw_items:
        print("[PhoBERT] Warning: No FAQ items found.")
        faq_questions = []
        return

    texts = [item["question"] for item in raw_items]
    print(f"[PhoBERT] Pre-embedding {len(texts)} FAQ questions with {MODEL_NAME}...")
    embeddings = encode_texts(texts)

    faq_questions = []
    for idx, item in enumerate(raw_items):
        faq_questions.append({
            "topic": item["topic"],
            "question": item["question"],
            "answer": item["answer"],
            "embedding": embeddings[idx]
        })
    print(f"[PhoBERT] FAQ Index ready with {len(faq_questions)} questions.")

@app.on_event("startup")
def startup():
    global tokenizer, model
    print(f"[PhoBERT] Loading model {MODEL_NAME}...")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    model = AutoModel.from_pretrained(MODEL_NAME)
    model.eval()
    build_faq_index()

class MatchRequest(BaseModel):
    query: str
    threshold: Optional[float] = None

@app.post("/match")
def match_faq(req: MatchRequest):
    if not faq_questions:
        return {"matched": False, "answer": "", "topic": "", "question": "", "score": 0.0}

    threshold = req.threshold if req.threshold is not None else DEFAULT_THRESHOLD
    query_emb = encode_texts([req.query])[0]

    best_score = -1.0
    best_item = None

    for item in faq_questions:
        score = float(np.dot(query_emb, item["embedding"]))
        if score > best_score:
            best_score = score
            best_item = item

    if best_item and best_score >= threshold:
        return {
            "matched": True,
            "answer": best_item["answer"],
            "topic": best_item["topic"],
            "question": best_item["question"],
            "score": float(best_score)
        }

    return {
        "matched": False,
        "answer": best_item["answer"] if best_item else "",
        "topic": best_item["topic"] if best_item else "",
        "question": best_item["question"] if best_item else "",
        "score": float(best_score) if best_item else 0.0
    }

@app.post("/reload")
def reload_index():
    build_faq_index()
    return {"status": "ok", "total_questions": len(faq_questions)}

@app.get("/health")
def health():
    return {"status": "ok", "questions_indexed": len(faq_questions)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5050)
