import { extractIntentAndEntities } from "../src/intentEngine";

function debugLog() {
    console.log("=== DEBUG USER REAL LOG ===");

    // User Message 1: "phòng 401 bị hỏng đèn r"
    const r1 = extractIntentAndEntities("phòng 401 bị hỏng đèn r");
    console.log("Msg 1 ('phòng 401 bị hỏng đèn r'):", r1);

    // User Message 2: "đèn không sáng, thợ có thể đến vào ngày mốt nhé"
    const r2 = extractIntentAndEntities("đèn không sáng, thợ có thể đến vào ngày mốt nhé", "401");
    console.log("Msg 2 ('đèn không sáng...'):", r2);
}

debugLog();
