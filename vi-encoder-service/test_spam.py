import sys, time, urllib.request, json

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = "http://localhost:3000"

def send(msg):
    body = json.dumps({"message": msg}).encode()
    req = urllib.request.Request(f"{BASE}/test-reply", data=body,
                                  headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())

print("=" * 55)
print("  TEST: Repeat Spam Guard (>= 3 lần / 30 giây)")
print("=" * 55)

# Gửi cùng 1 tin nhắn 5 lần liên tiếp
msg = "wifi mật khẩu"
print(f"\nGửi '{msg}' 5 lần liên tiếp:\n")
for i in range(1, 6):
    try:
        res = send(msg)
        reply = res.get("reply", "")
        if reply:
            print(f"  Lần {i}: REPLIED  → {reply[:60].strip()!r}")
        else:
            print(f"  Lần {i}: IGNORED  (bị bỏ qua - spam guard)")
    except Exception as e:
        # 204 / empty response → bị bỏ qua
        print(f"  Lần {i}: IGNORED  (bị bỏ qua - spam guard) [{e}]")
    time.sleep(0.3)

print("\n✅ Kết quả mong đợi: Lần 1-2 REPLIED, từ lần 3 trở đi bị IGNORED")
print()
print("Đợi 31 giây để reset cửa sổ spam...")
time.sleep(31)

print(f"\nGửi lại '{msg}' sau khi hết window 30s:")
res = send(msg)
reply = res.get("reply", "")
if reply:
    print(f"  → REPLIED lại bình thường: {reply[:60].strip()!r}")
else:
    print(f"  → IGNORED (lỗi logic!)")

print("\n" + "=" * 55)
