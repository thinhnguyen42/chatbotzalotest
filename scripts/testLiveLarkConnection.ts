import { getApprovedLinkRequests } from "../src/lark/larkClient";

async function testLive() {
    const res = await getApprovedLinkRequests();
    console.log("✅ KẾT NỐI LARK BASE THẬT THÀNH CÔNG!");
    console.log("Số lượng record đã duyệt chờ bot xử lý:", res.length);
}

testLive().catch(console.error);
