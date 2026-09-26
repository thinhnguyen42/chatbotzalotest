import { spawn, ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import axios from "axios";

let ttlockChildProcess: ChildProcess | null = null;

/**
 * Kiểm tra xem dịch vụ TTLock FastAPI (cổng 8001) có đang chạy hay không.
 */
export async function isTTLockServiceHealthy(url?: string): Promise<boolean> {
    const targetUrl = url || process.env.TTLOCK_SERVICE_URL || "http://localhost:8001";
    try {
        const checkEndpoint = `${targetUrl.replace(/\/$/, "")}/docs`;
        const res = await axios.get(checkEndpoint, { timeout: 1500 });
        return res.status === 200;
    } catch {
        return false;
    }
}

/**
 * Tự động khởi động dịch vụ Python TTLock FastAPI nếu chưa chạy.
 * Đảm bảo khi deploy lên server (hoặc chạy local), dịch vụ cổng 8001 sẽ tự động mở mà không cần thao tác thủ công.
 */
export async function startTTLockServiceIfNeeded(): Promise<void> {
    // 1. Kiểm tra nếu đã chạy sẵn trên cổng 8001 (hoặc qua Docker)
    const isHealthy = await isTTLockServiceHealthy();
    if (isHealthy) {
        console.log("[ttlockServiceManager] ✅ Dịch vụ TTLock FastAPI (cổng 8001) đang hoạt động bình thường.");
        return;
    }

    // 2. Tìm thư mục chứa mã nguồn Python FastAPI
    const candidatePaths = [
        path.resolve(process.cwd(), "IotHubTTlock-main", "IotHubTTlock-main"),
        path.resolve(process.cwd(), "..", "IotHubTTlock-main", "IotHubTTlock-main"),
        path.resolve(__dirname, "..", "..", "IotHubTTlock-main", "IotHubTTlock-main"),
    ];

    let pythonServiceDir: string | null = null;
    for (const p of candidatePaths) {
        if (fs.existsSync(path.join(p, "Main.py"))) {
            pythonServiceDir = p;
            break;
        }
    }

    if (!pythonServiceDir) {
        console.log(
            "[ttlockServiceManager] ℹ️ Không tìm thấy thư mục mã nguồn Python TTLock nội bộ. " +
            "Hệ thống sẽ kết nối trực tiếp TTLock Cloud API (euapi.sciener.com) tự động."
        );
        return;
    }

    // 3. Tự động spawn tiến trình uvicorn chạy cổng 8001
    const pythonCmd = process.platform === "win32" ? "python" : "python3";
    console.log(`[ttlockServiceManager] 🚀 Đang tự động khởi chạy TTLock FastAPI trên cổng 8001 từ: ${pythonServiceDir}...`);

    try {
        ttlockChildProcess = spawn(
            pythonCmd,
            ["-m", "uvicorn", "Main:app", "--host", "0.0.0.0", "--port", "8001"],
            {
                cwd: pythonServiceDir,
                shell: process.platform === "win32",
                stdio: ["ignore", "pipe", "pipe"],
                detached: false,
            }
        );

        ttlockChildProcess.stdout?.on("data", (data) => {
            const msg = data.toString().trim();
            if (msg.includes("Uvicorn running") || msg.includes("Application startup complete")) {
                console.log(`[ttlockServiceManager] ✅ TTLock FastAPI đã khởi động thành công: ${msg}`);
            }
        });

        ttlockChildProcess.stderr?.on("data", (data) => {
            const msg = data.toString().trim();
            // Uvicorn log info ra stderr theo mặc định
            if (msg.includes("Uvicorn running") || msg.includes("Application startup complete")) {
                console.log(`[ttlockServiceManager] ✅ TTLock FastAPI đã khởi động thành công: ${msg}`);
            }
        });

        ttlockChildProcess.on("error", (err) => {
            console.warn("[ttlockServiceManager] ⚠️ Không thể khởi chạy tiến trình Python TTLock:", err.message);
            console.log("[ttlockServiceManager] 🔄 Bot sẽ tự động sử dụng TTLock Cloud API trực tiếp.");
            ttlockChildProcess = null;
        });

        ttlockChildProcess.on("exit", (code, signal) => {
            if (code !== 0 && code !== null) {
                console.warn(`[ttlockServiceManager] ⚠️ Tiến trình TTLock FastAPI đã dừng (code: ${code}, signal: ${signal}).`);
            }
            ttlockChildProcess = null;
        });

        // Dọn dẹp tiến trình con khi Node.js tắt
        const cleanUp = () => {
            if (ttlockChildProcess && !ttlockChildProcess.killed) {
                try {
                    ttlockChildProcess.kill();
                } catch {}
            }
        };
        process.on("exit", cleanUp);
        process.on("SIGINT", cleanUp);
        process.on("SIGTERM", cleanUp);

    } catch (err: any) {
        console.warn("[ttlockServiceManager] ⚠️ Lỗi khi khởi tạo tiến trình con TTLock:", err.message);
    }
}
