import "dotenv/config";
import axios from "axios";

async function testGemini25() {
    const geminiKey = process.env.GEMINI_API_KEY || "";
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
        const res = await axios.post(
            url,
            {
                contents: [{ role: "user", parts: [{ text: "Dạ em chào anh, bot hoạt động tốt không ạ?" }] }]
            },
            { headers: { "Content-Type": "application/json" } }
        );
        console.log("✅ Gemini 2.5 Flash SUCCESS:", res.data?.candidates?.[0]?.content?.parts?.[0]?.text);
    } catch (err: any) {
        console.error("❌ Gemini Error:", err.response?.status, err.response?.data || err.message);
    }
}

testGemini25();
