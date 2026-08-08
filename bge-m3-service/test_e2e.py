import sys, time, urllib.request, json

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

print("Waiting for BGE-M3 (port 5051)...", flush=True)
for i in range(60):
    try:
        with urllib.request.urlopen("http://localhost:5051/health", timeout=3) as r:
            data = json.loads(r.read())
            entries = data.get("faq_entries", 0)
            print(f"  [{i+1}] status={data['status']} faq_entries={entries}", flush=True)
            if entries > 0:
                print("BGE-M3 READY!", flush=True)
                break
    except Exception as e:
        print(f"  [{i+1}] Not ready: {e}", flush=True)
    time.sleep(2)
else:
    print("TIMEOUT: BGE-M3 did not start in time.")
    sys.exit(1)

# Now run e2e tests
BASE = "http://localhost:3000"

def test_reply(msg):
    body = json.dumps({"message": msg}).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE}/test-reply", data=body,
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode("utf-8"))

tests = [
    ("phi dich vu hang thang",   "Phí dịch vụ"),
    ("dia chi toa nha o dau",    "Địa chỉ"),
    ("nuoi meo duoc khong",      "thú cưng"),
    ("bao hong may lanh",        "thiết bị"),
    ("mat khau wifi",            "Wifi"),
    ("phí dịch vụ hàng tháng",  "chi phí"),
    ("nuôi thú cưng",            "thú cưng"),
    ("trả phòng thủ tục",        "bàn giao"),
    ("số người ở",               "người"),
    ("how to pay rent",          "thanh toán"),
    ("check out procedure",      "phòng"),
    ("wifi password",            "Wifi"),
]

print()
print("=" * 60)
print("  END-TO-END TEST (BGE-M3 + Normalize Pipeline)")
print("=" * 60)

passed = 0
for msg, keyword in tests:
    try:
        res = test_reply(msg)
        reply = res.get("reply", "")
        ok = keyword.lower() in reply.lower()
        status = "PASS" if ok else "FAIL"
        if ok:
            passed += 1
        print(f"\n[{status}] {msg!r}")
        print(f"       keyword={keyword!r} | reply: {reply[:70].strip()!r}")
    except Exception as e:
        print(f"\n[ERR]  {msg!r} => {e}")

print()
print("=" * 60)
print(f"  RESULT: {passed}/{len(tests)} PASSED")
print("=" * 60)
