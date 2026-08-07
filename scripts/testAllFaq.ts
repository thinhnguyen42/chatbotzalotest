import "dotenv/config";
import { generateRagReply } from "../src/rag/ragEngine";
import { loadFaqItems } from "../src/rag/faqParser";

async function runTests() {
    const items = loadFaqItems();
    console.log(`\n=== Testing all ${items.length} FAQ topics ===\n`);

    let passed = 0;
    let failed = 0;

    for (const item of items) {
        console.log(`Topic: [${item.topic}]`);
        for (const q of item.questions) {
            try {
                const reply = await generateRagReply(q);
                const isMatch = reply.length > 50 && !reply.includes("Quản gia AI chưa tìm thấy");
                if (isMatch) {
                    console.log(`  ✅ [PASS] "${q}"`);
                    passed++;
                } else {
                    console.log(`  ❌ [FAIL] "${q}" -> Got: ${reply.slice(0, 60)}...`);
                    failed++;
                }
            } catch (err: any) {
                console.log(`  ❌ [ERROR] "${q}" -> ${err.message}`);
                failed++;
            }
        }
    }

    console.log(`\n=== Test Results: ${passed} Passed, ${failed} Failed ===\n`);
}

runTests();
