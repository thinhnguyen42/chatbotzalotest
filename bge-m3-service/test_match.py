import sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import urllib.request
import json

BASE = "http://localhost:5051"

def post(path, data):
    body = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(f"{BASE}{path}", data=body,
                                  headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read().decode("utf-8"))

tests = [
    "phi dich vu hang thang",
    "wifi password",
    "dia chi toa nha",
    "nuoi meo duoc khong",
    "bao hong may lanh",
    "how to pay rent",
    "check out procedure",
]

print("=== BGE-M3 Match Tests ===\n")
for q in tests:
    res = post("/match", {"query": q})
    status = "✅ MATCHED" if res["matched"] else "❌ NO MATCH"
    print(f"Query : {q}")
    print(f"Status: {status} | score={res['score']:.3f} | topic={res['topic']}")
    if res["matched"]:
        print(f"Answer: {res['answer'][:80]}...")
    print()
