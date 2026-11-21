/**
 * ENTRYPOINT ĐỘC LẬP CHO MODULE OU (SỔ TAY SINH VIÊN ĐẠI HỌC MỞ TP.HCM)
 * Dùng để chạy và test riêng Bot OU mà không khởi động các dịch vụ nhà trọ (TTLock, Bills Cron, CSV Watcher).
 */

import "dotenv/config";
import express from "express";
import { ouRouter } from "./ouRouter";

const app = express();
app.use(express.json());

app.use("/ou", ouRouter);
app.use("/api/ou", ouRouter);

// Mở trang gốc sẽ chuyển thẳng sang giao diện Test Bot OU
app.get("/", (_req, res) => {
    res.redirect("/ou/test");
});

const INITIAL_PORT = Number(process.env.OU_PORT || 3010);

function startOuServer(port: number, retriesLeft = 10): void {
    const server = app.listen(port, () => {
        console.log(`[OU Bot] Server độc lập đang chạy tại http://localhost:${port}`);
        console.log(`[OU Bot] Test UI:   http://localhost:${port}/ou/test`);
        console.log(`[OU Bot] Ask API:   POST http://localhost:${port}/ou/ask`);
        console.log(`[OU Bot] Topics:    GET  http://localhost:${port}/ou/topics`);
        console.log(`[OU Bot] Health:    GET  http://localhost:${port}/ou/health`);
    });

    server.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE" && retriesLeft > 0) {
            console.log(`[OU Bot] Cổng ${port} đang bận, tự động thử cổng ${port + 1}...`);
            startOuServer(port + 1, retriesLeft - 1);
            return;
        }
        console.error("[OU Bot] Không thể khởi động server:", err.message);
        process.exit(1);
    });
}

startOuServer(INITIAL_PORT);
