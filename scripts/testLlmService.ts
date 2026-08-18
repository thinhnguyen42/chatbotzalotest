import "dotenv/config";
import { generateLlmAnswer } from "../src/llm/llmService";

async function testLlm() {
    console.log("--- TEST LLM SERVICE ---");

    const userText = "Phòng em bị hỏng khóa cửa thì báo ai vậy ạ?";
    const history = [
        { role: "user" as const, content: "Chào bot, em ở phòng 302", timestamp: Date.now() - 10000 },
        { role: "assistant" as const, content: "Dạ em chào anh/chị ở phòng 302 ạ. Em có thể hỗ trợ gì cho mình ạ?", timestamp: Date.now() - 5000 },
    ];
    const chunks = [
        "Chatbot: Trường hợp hỏng hóc thiết bị, khóa cửa hoặc sự cố kỹ thuật trong phòng, bạn vui lòng nhắn tin trực tiếp hoặc gọi Hotline Ban quản lý: 0938244695 để được thợ hỗ trợ sửa chữa trong vòng 30 phút.",
    ];
    const sessionContext = { roomNumber: "302" };

    console.log("Calling LLM Service...");
    const answer = await generateLlmAnswer(userText, history, chunks, sessionContext);

    console.log("\n--- LLM RESPONSE OUTPUT ---");
    console.log(answer);

    if (answer && answer.length > 10) {
        console.log("\n✅ LLM SERVICE TEST PASSED!");
    } else {
        console.log("\n⚠️ LLM API Keys might not be configured or call failed. Check .env!");
    }
}

testLlm();
