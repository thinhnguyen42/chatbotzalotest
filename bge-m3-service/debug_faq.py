import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, '.')
import os
os.environ['BGEM3_FAQ_PATH'] = r'D:\Hoc tap\thenewzalooa\Chatbot\data\knowledge-base\faq.md'

from main import load_faq_items, FAQ_PATH
print(f"FAQ Path: {FAQ_PATH}")
print(f"Exists: {FAQ_PATH.exists()}")

items = load_faq_items()
print(f"\nLoaded {len(items)} FAQ items:")
for item in items:
    print(f"  [{item['topic']}] questions={len(item['questions'])}, answer_len={len(item['answer'])}")
