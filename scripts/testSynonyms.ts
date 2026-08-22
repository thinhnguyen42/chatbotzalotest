import { expandVietnameseAbbreviations } from "../src/utils/synonymUtils";

function testSynonyms() {
    console.log("=== TESTING VIETNAMESE SYNONYM & ABBREVIATION EXPANSION ===");

    const input1 = "p401 đh hỏng không mát r";
    const res1 = expandVietnameseAbbreviations(input1);
    console.log(`Input 1: "${input1}" -> Output: "${res1}"`);

    const input2 = "cho hỏi quy định pccc và nuôi pet";
    const res2 = expandVietnameseAbbreviations(input2);
    console.log(`Input 2: "${input2}" -> Output: "${res2}"`);

    const input3 = "phí dv bql tháng này bao nhiêu";
    const res3 = expandVietnameseAbbreviations(input3);
    console.log(`Input 3: "${input3}" -> Output: "${res3}"`);

    if (
        res1.includes("phòng 401 điều hòa") &&
        res2.includes("phòng cháy chữa cháy") &&
        res2.includes("thú cưng") &&
        res3.includes("dịch vụ ban quản lý")
    ) {
        console.log("\n✅ VIETNAMESE SYNONYM TEST PASSED!");
    } else {
        console.error("\n❌ TEST FAILED!");
        process.exit(1);
    }
}

testSynonyms();
