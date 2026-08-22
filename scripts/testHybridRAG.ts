import "dotenv/config";
import { generateRagReply } from "../src/rag/ragEngine";
import { expandVietnameseAbbreviations } from "../src/utils/synonymUtils";
import { searchBm25 } from "../src/rag/bm25Search";

async function testHybridRAG() {
    console.log("=================================================");
    console.log("  TESTING STEP 3: HYBRID SEARCH & SYNONYMS RAG   ");
    console.log("=================================================");

    // Test 1: Mở rộng từ viết tắt
    const abbrText = "cho hoi ve noi quy pccc va phi dv p401 bql";
    const expanded = expandVietnameseAbbreviations(abbrText);
    console.log(`\nAbbreviation Expansion: "${abbrText}" -> "${expanded}"`);

    // Test 2: BM25 Search với câu hỏi mở rộng
    const bm25Res = searchBm25(expanded, 2);
    console.log(`\nBM25 Results Count: ${bm25Res.length}`);
    if (bm25Res.length > 0) {
        console.log(`Top BM25 Match [Score ${bm25Res[0].score.toFixed(3)}]: ${bm25Res[0].chunk.text.substring(0, 70)}...`);
    }

    // Test 3: Chạy thử RAG Engine với câu hỏi gõ tắt
    console.log("\nCalling RAG Engine with abbreviated query: 'cho hoi ve noi quy pccc'...");
    const reply = await generateRagReply("cho hoi ve noi quy pccc", "hybrid_test_user");
    console.log("\nRAG Reply Output:\n", reply);

    if (expanded.includes("phòng cháy chữa cháy") && reply.length > 20) {
        console.log("\n✅ STEP 3 HYBRID SEARCH & SYNONYMS RAG TEST PASSED!");
    } else {
        console.error("\n❌ STEP 3 TEST FAILED!");
        process.exit(1);
    }
}

testHybridRAG();
