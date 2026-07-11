import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import * as crypto from 'node:crypto';
import { execSync } from "node:child_process";
import dotenv from "dotenv";
import { WebhookHandler } from "./handlers/webhook";
dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const APP_SECRET = process.env.ZALO_APP_SECRET || "";

/**
 * Xác thực chữ ký MAC từ Zalo OA Webhook
 * Zalo gửi header "X-Zalo-Signature" = HMAC-SHA256(body, app_secret)
 */
function verifyZaloSignature(data: string, signature: string | undefined): boolean {
  try {
    if (!signature) return false;
    const mac = signature.startsWith("mac=") ? signature.slice(4) : signature;

    const hash = crypto.createHash('sha256');
    hash.update(data);
    const expected = hash.digest('hex');

    console.log("Debug MAC:", {
      signature: mac,
      expected,
      bodyLength: data.length,
    });
    return mac === expected;
  } catch (err) {
    console.error("Lỗi xử lý signature:", err);
    return false;
  }
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  // Nhận Webhook tại endpoint /webhook
  if (req.method === "POST" && req.url === "/webhook") {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.from(chunk));
      }

      const rawBody = Buffer.concat(chunks).toString("utf8");
      const data = JSON.parse(rawBody);

      // ====================================================
      // BẢO MẬT: Xác thực chữ ký MAC từ Zalo
      // ====================================================
      const signature = req.headers["x-zevent-signature"] as string | undefined;
      const rawVerify = data.app_id + rawBody + data.timestamp + APP_SECRET;

      if (!verifyZaloSignature(rawVerify, signature)) {
        console.warn(`[SECURITY] ⚠️ Yêu cầu bị từ chối - Chữ ký không hợp lệ! IP: ${req.socket.remoteAddress}`);
        res.writeHead(401);
        res.end("Unauthorized");
        return;
      }

      const payload = JSON.parse(rawBody);

      // TRẢ VỀ 200 OK NGAY LẬP TỨC CHO ZALO (Tránh bị Zalo báo lỗi Timeout Webhook)
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: 0, message: "ok" }));

      // Chạy ngầm logic xử lý tin nhắn phía sau
      WebhookHandler.handleEvent(payload).catch(err => {
        console.error("Lỗi xử lý:", err);
      });
    } catch (e) {
      res.writeHead(400);
      res.end("Bad Request");
    }
    return;
  }

  // Zalo Domain Verification
  if (req.method === "GET" && req.url === "/zalo_verifierK-IE996M7WPHfwLRYQTpSNIFytgO-IabDJOo.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta property="zalo-platform-site-verification" content="K-IE996M7WPHfwLRYQTpSNIFytgO-IabDJOo" />
</head>
<body>
There Is No Limit To What You Can Accomplish Using Zalo!
</body>
</html>`);
    return;
  }

  // Health check endpoint
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }));
    return;
  }


  res.writeHead(404);
  res.end("Not Found");
});

// Tự động giải phóng port nếu bị chiếm
server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.log(`\n  Port ${PORT} đang bị chiếm. Đang tự động kill process cũ...`);
    try {
      execSync(
        `powershell -Command "Get-NetTCPConnection -LocalPort ${PORT} -EA SilentlyContinue | Select-Object -Exp OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force -EA SilentlyContinue }"`,
        { stdio: "ignore" }
      );
      console.log(` Đã giải phóng port ${PORT}. Đang khởi động lại...\n`);
      setTimeout(() => server.listen(PORT), 800);
    } catch {
      console.error(` Không thể tự động giải phóng port ${PORT}.`);
      process.exit(1);
    }
  } else {
    throw err;
  }
});

server.listen(PORT, () => {
  console.log(`✅ Zalo OA Standalone Server đang chạy tại Port: ${PORT}`);
  console.log(`📌 Webhook Endpoint: http://localhost:${PORT}/webhook`);
  console.log(`🔒 Bảo mật: Xác thực MAC Signature (HMAC-SHA256) đang BẬT`);
  console.log(`🏥 Health Check: http://localhost:${PORT}/health`);
});