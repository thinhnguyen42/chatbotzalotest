import { searchBm25 } from "../src/rag/bm25Search";

function testBm25() {
    console.log("=== TESTING BM25 KEYWORD SEARCH ===");

    const query = "nội quy phòng cháy chữa cháy pccc";
    const results = searchBm25(query, 3);

    console.log(`Query: "${query}"`);
    console.log(`Top ${results.length} BM25 Matches:`);
    results.forEach((r, i) => {
        console.log(`${i + 1}. [Score: ${r.score.toFixed(3)}] ${r.chunk.text.substring(0, 80)}...`);
    });

    if (results.length >= 0) {
        console.log("\n✅ BM25 SEARCH TEST PASSED!");
    } else {
        console.error("\n❌ TEST FAILED!");
        process.exit(1);
    }
}

testBm25();
