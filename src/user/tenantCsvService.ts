import fs from "fs";
import path from "path";
import axios from "axios";
import { removeVietnameseDiacritics } from "../utils/textUtils";
import { ADMIN_PHONE_NUMBER } from "../config/adminConfig";
import { getSession, updateSessionContext } from "../memory/sessionMemory";
import { setCachedRole, extractCccd } from "./userRoleService";
import { setUserTagInZalo, notifyAdmin } from "../zaloClient";

export interface CsvTenant {
    tenantName: string;
    cccd: string;
    roomNumber: string;
    tagCode: string;
    building: string;
    phone?: string;
    role: "PRIMARY_LEASEHOLDER" | "CO_RESIDENT";
}

const ACTIVE_LINKS_FILE = path.resolve(process.cwd(), "data", "active-links.json");
const TENANTS_CSV_FILE = process.env.TENANTS_CSV_PATH || path.resolve(process.cwd(), "data", "tenants.csv");

// Bộ nhớ đệm cư dân trong RAM và thông tin giám sát file
let cachedTenants: CsvTenant[] = [];
let lastCsvMtimeMs: number = 0;
let lastCsvSize: number = 0;
let csvWatcherRunning: boolean = false;

/**
 * Đọc toàn bộ danh sách liên kết đang hoạt động từ active-links.json
 */
export function getLocalActiveLinks(): Record<string, any> {
    try {
        if (fs.existsSync(ACTIVE_LINKS_FILE)) {
            const raw = fs.readFileSync(ACTIVE_LINKS_FILE, "utf-8");
            return JSON.parse(raw) || {};
        }
    } catch (err: any) {
        console.warn("[tenantCsvService] Cảnh báo đọc active-links.json:", err.message);
    }
    return {};
}

/**
 * Lưu danh sách liên kết vào active-links.json
 */
export function saveLocalActiveLinks(links: Record<string, any>): void {
    try {
        const dir = path.dirname(ACTIVE_LINKS_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(ACTIVE_LINKS_FILE, JSON.stringify(links, null, 2), "utf-8");
    } catch (err: any) {
        console.error("[tenantCsvService] Lỗi ghi active-links.json:", err.message);
    }
}

/**
 * Tách dòng CSV xử lý đúng dấu phẩy, dấu chấm phẩy và dấu ngoặc kép ("...")
 */
function parseCsvLine(line: string, delimiter: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === delimiter && !inQuotes) {
            result.push(current.trim());
            current = "";
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
}

/**
 * Đọc và phân tích file tenants.csv có tích hợp RAM Cache thông minh.
 * Nếu file không thay đổi (khớp mtime và size), hàm trả về dữ liệu trong RAM ngay lập tức (0ms, 0 disk I/O).
 */
export function loadTenantsFromCsv(forceReload = false): CsvTenant[] {
    if (!fs.existsSync(TENANTS_CSV_FILE)) {
        console.warn(`[tenantCsvService] ⚠️ Không tìm thấy file tenants.csv tại: ${TENANTS_CSV_FILE}`);
        cachedTenants = [];
        return [];
    }

    try {
        const stat = fs.statSync(TENANTS_CSV_FILE);
        if (!forceReload && cachedTenants.length > 0 && stat.mtimeMs === lastCsvMtimeMs && stat.size === lastCsvSize) {
            return cachedTenants;
        }

        let content = fs.readFileSync(TENANTS_CSV_FILE, "utf-8");
        // Loại bỏ BOM nếu có (UTF-8 BOM: \uFEFF)
        if (content.charCodeAt(0) === 0xfeff) {
            content = content.slice(1);
        }

        const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        if (lines.length < 2) {
            cachedTenants = [];
            return [];
        }

        // Tự động nhận diện dấu phân cách (dấu phẩy , hoặc chấm phẩy ;)
        const headerLine = lines[0];
        const delimiter = headerLine.includes(";") && !headerLine.includes(",") ? ";" : ",";

        const headers = parseCsvLine(headerLine, delimiter).map((h) =>
            removeVietnameseDiacritics(h.toLowerCase()).replace(/[^a-z0-9]/g, "")
        );

        // Xác định vị trí các cột chính xác
        const nameIdx = headers.findIndex(
            (h) => h.includes("hovaten") || h === "ten" || h === "name" || (h.includes("ten") && !h.startsWith("ma"))
        );
        const cccdIdx = headers.findIndex((h) => h.includes("cccd") || h.includes("cmnd") || h.includes("dinhdanh"));
        const roomIdx = headers.findIndex((h) => h.includes("phong") || h.includes("room"));
        const buildingIdx = headers.findIndex((h) => h.includes("toanha") || h.includes("building"));
        const phoneIdx = headers.findIndex((h) => h.includes("sdt") || h.includes("dienthoai") || h.includes("phone"));
        const roleIdx = headers.findIndex((h) => h.includes("vaitro") || h.includes("role"));

        if (nameIdx === -1 || cccdIdx === -1 || roomIdx === -1) {
            console.error(
                `[tenantCsvService] ❌ File tenants.csv thiếu một trong các cột bắt buộc (Họ tên, CCCD, Số phòng). Các cột đọc được:`,
                headers
            );
            return [];
        }

        const tenants: CsvTenant[] = [];

        for (let i = 1; i < lines.length; i++) {
            const cols = parseCsvLine(lines[i], delimiter);
            if (cols.length <= Math.max(nameIdx, cccdIdx, roomIdx)) continue;

            const rawName = cols[nameIdx] || "";
            const rawCccd = (cols[cccdIdx] || "").replace(/\D/g, "");
            const rawRoom = cols[roomIdx] || "";
            const rawBuilding = buildingIdx !== -1 && cols[buildingIdx] ? cols[buildingIdx] : "38PBV";
            const rawPhone = phoneIdx !== -1 && cols[phoneIdx] ? cols[phoneIdx].replace(/\D/g, "") : undefined;
            const rawRole = roleIdx !== -1 && cols[roleIdx] ? cols[roleIdx] : "PRIMARY_LEASEHOLDER";

            if (!rawName || !rawCccd) continue;

            // Chuẩn hóa số phòng (ví dụ "P.101", "Phòng 101" -> "101")
            const roomMatch = rawRoom.match(/\d{3,4}/);
            const roomNumber = roomMatch ? roomMatch[0] : rawRoom.replace(/[^a-zA-Z0-9]/g, "");
            let building = (rawBuilding.trim() || "38PBV").toUpperCase();
            if (!building || building === "TEST") {
                building = "38PBV";
            }
            const tagCode = `${building}-${roomNumber}`;

            const normRole = removeVietnameseDiacritics(rawRole);
            const role: "PRIMARY_LEASEHOLDER" | "CO_RESIDENT" =
                normRole.includes("cung") || normRole.includes("phu") || normRole.includes("resident") || normRole.includes("con")
                    ? "CO_RESIDENT"
                    : "PRIMARY_LEASEHOLDER";

            tenants.push({
                tenantName: rawName.trim(),
                cccd: rawCccd,
                roomNumber,
                tagCode,
                building,
                phone: rawPhone,
                role,
            });
        }

        cachedTenants = tenants;
        lastCsvMtimeMs = stat.mtimeMs;
        lastCsvSize = stat.size;
        console.log(`[tenantCsvService] 📁 Đã tải và nạp vào RAM cache ${tenants.length} cư dân từ tenants.csv (Dung lượng: ${stat.size} bytes).`);

        return tenants;
    } catch (err: any) {
        console.error("[tenantCsvService] Lỗi khi đọc file CSV:", err.message);
        return [];
    }
}

/**
 * Lấy danh sách cư dân hiện tại trong bộ nhớ đệm RAM (0 disk I/O, 0ms)
 */
export function getCachedTenants(): CsvTenant[] {
    if (cachedTenants.length === 0) {
        return loadTenantsFromCsv();
    }
    return cachedTenants;
}

/**
 * Tìm cư dân theo số CCCD trong bộ nhớ đệm
 */
export function findTenantByCccd(cccd: string): CsvTenant | undefined {
    const clean = (cccd || "").replace(/\D/g, "");
    if (!clean) return undefined;
    return getCachedTenants().find((t) => t.cccd === clean);
}

/**
 * Tìm danh sách cư dân theo số phòng trong bộ nhớ đệm
 */
export function findTenantsByRoom(roomNumber: string): CsvTenant[] {
    const clean = (roomNumber || "").replace(/\D/g, "");
    if (!clean) return [];
    return getCachedTenants().filter((t) => t.roomNumber === clean);
}

/**
 * Đối chiếu và đồng bộ lại danh sách active-links.json khi có file CSV mới
 */
export function syncActiveLinksWithCsv(): void {
    try {
        const activeLinks = getLocalActiveLinks();
        const keys = Object.keys(activeLinks);
        if (keys.length === 0) return;

        const currentTenants = loadTenantsFromCsv();
        let changed = false;

        for (const key of keys) {
            const link = activeLinks[key];
            const cleanCccd = String(link.cccd || "").replace(/\D/g, "");
            if (!cleanCccd) continue;

            const matched = currentTenants.find((t) => t.cccd === cleanCccd);
            if (matched) {
                if (
                    link.roomNumber !== matched.roomNumber ||
                    link.tagCode !== matched.tagCode ||
                    link.tenantName !== matched.tenantName ||
                    link.role !== matched.role
                ) {
                    console.log(`[tenantCsvService] 🔄 Cập nhật thông tin cư dân ${link.tenantName} (${link.roomNumber} -> ${matched.roomNumber})`);
                    link.roomNumber = matched.roomNumber;
                    link.tagCode = matched.tagCode;
                    link.tenantName = matched.tenantName;
                    link.role = matched.role;
                    changed = true;
                }
            } else {
                console.log(`[tenantCsvService] ℹ️ Cư dân ${link.tenantName} (Phòng ${link.roomNumber}, CCCD ${cleanCccd}) không có trong danh bạ CSV mới.`);
            }
        }

        if (changed) {
            saveLocalActiveLinks(activeLinks);
            console.log("[tenantCsvService] 💾 Đã cập nhật active-links.json sau khi đồng bộ với file tenants.csv mới.");
        }
    } catch (err: any) {
        console.error("[tenantCsvService] Lỗi khi đồng bộ active-links với CSV:", err.message);
    }
}

/**
 * Khởi động tiến trình giám sát file tenants.csv (Watcher)
 * Tự động phát hiện khi file tenants.csv bị ghi đè/thay đổi bởi người dùng,
 * tự động nạp lại cache RAM và đồng bộ active-links mà không cần khởi động lại bot.
 */
export function startCsvTenantWatcher(): void {
    if (csvWatcherRunning) {
        return;
    }

    // Nạp ban đầu vào RAM
    loadTenantsFromCsv();

    if (!fs.existsSync(TENANTS_CSV_FILE)) {
        console.warn(`[tenantCsvService] ⚠️ Chưa tìm thấy file tenants.csv để thiết lập watcher: ${TENANTS_CSV_FILE}`);
    }

    try {
        fs.watchFile(TENANTS_CSV_FILE, { interval: 2000 }, (curr, prev) => {
            if (curr.mtimeMs !== prev.mtimeMs || curr.size !== prev.size) {
                console.log(`[tenantCsvService] 🔄 Phát hiện file tenants.csv đã được cập nhật! (Size: ${curr.size}B, mtime: ${new Date(curr.mtimeMs).toLocaleTimeString()}). Đang làm mới bộ nhớ đệm...`);
                loadTenantsFromCsv(true);
                syncActiveLinksWithCsv();
            }
        });
        csvWatcherRunning = true;
        console.log(`[tenantCsvService] 👁️ Đã kích hoạt cơ chế theo dõi tự động tenants.csv (Khoảng kiểm tra: 2s).`);
    } catch (err: any) {
        console.warn(`[tenantCsvService] Không thể thiết lập fs.watchFile cho tenants.csv:`, err.message);
    }
}

export function stopCsvTenantWatcher(): void {
    if (csvWatcherRunning) {
        try {
            fs.unwatchFile(TENANTS_CSV_FILE);
            csvWatcherRunning = false;
            console.log(`[tenantCsvService] Đã dừng theo dõi file tenants.csv.`);
        } catch {}
    }
}

/**
 * Kiểm tra tên người dùng gửi có khớp với tên trong danh sách hợp đồng CSV không.
 * Hỗ trợ so sánh không phân biệt hoa thường, không dấu tiếng Việt.
 */
export function isNameMatch(inputName: string, csvName: string): boolean {
    const cleanIn = removeVietnameseDiacritics(inputName).replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
    const cleanCsv = removeVietnameseDiacritics(csvName).replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();

    if (!cleanIn || !cleanCsv) return false;
    if (cleanIn === cleanCsv) return true;

    const inWords = cleanIn.split(" ");
    const csvWords = cleanCsv.split(" ");

    // Nếu người dùng nhập đầy đủ Tên (ít nhất tên chính khớp)
    const inLastName = inWords[inWords.length - 1];
    const csvLastName = csvWords[csvWords.length - 1];

    if (inLastName === csvLastName) {
        // Khớp Họ + Tên
        if (inWords[0] === csvWords[0]) return true;
        // Nếu tên trong CSV chứa trọn vẹn chuỗi người dùng nhập hoặc ngược lại
        if (cleanCsv.includes(cleanIn) || cleanIn.includes(cleanCsv)) return true;
    }

    return cleanCsv.includes(cleanIn) || cleanIn.includes(cleanCsv);
}

export const NON_NAME_KEYWORDS = [
    "tai khoan", "ngan hang", "don hang", "buu kien", "ma pin", "passcode",
    "wifi", "tien dien", "tien phong", "tien nuoc", "stk", "hop dong",
    "bien lai", "chuyen khoan", "so phong", "phong", "bao hiem", "cong to",
    "dien thoai", "lien he", "admin", "hotline", "khach hang"
];

/**
 * Kiểm tra xem một chuỗi có phải là Họ và Tên người hợp lệ hay không.
 * Yêu cầu: ít nhất 2 từ (Họ + Tên), không chứa từ khóa rác (tài khoản, đơn hàng, wifi...).
 */
export function isValidFullName(name: string): boolean {
    if (!name || name.length < 4) return false;
    const words = name.trim().split(/\s+/);
    if (words.length < 2 || words.length > 6) return false;

    const norm = removeVietnameseDiacritics(name.toLowerCase());
    for (const kw of NON_NAME_KEYWORDS) {
        if (norm.includes(kw)) return false;
    }

    for (const w of words) {
        if (!/^[a-zA-ZÀ-ỹ]+$/.test(w)) return false;
    }
    return true;
}

/**
 * Kiểm tra tin nhắn có từ khóa định danh CCCD/Cư dân rõ ràng hay không.
 */
export function hasExplicitCccdKeyword(text: string): boolean {
    return /(?:cccd|cmnd|căn\s*cước|can\s*cuoc|định\s*danh|dinh\s*danh|xác\s*thực|xac\s*thuc|cư\s*dân|cu\s*dan|chủ\s*hộ|chu\s*ho|người\s*thuê|nguoi\s*thue|hợp\s*đồng|hop\s*dong)/i.test(text);
}

/**
 * Trích xuất tên từ tin nhắn khi người dùng gửi kèm cả tên và CCCD
 * Ví dụ: "Nguyễn Văn A 079201001234", "Tôi tên Nguyễn Văn A, số cccd: 079201001234"
 */
export function extractNameFromMessage(text: string, cccd: string): string {
    let t = text;
    // Bỏ số CCCD
    t = t.replace(cccd, " ");
    // Bỏ các từ khóa nhãn xưng hô phổ biến
    t = t.replace(
        /(?:tôi\s+tên\s+là|toi\s+ten\s+la|tôi\s+tên|toi\s+ten|tôi\s+là|toi\s+la|tên\s+tôi\s+là|ten\s+toi\s+la|họ\s+và\s+tên|ho\s+va\s+ten|họ\s+tên|ho\s+ten|tên|ten|cccd|cmnd|số\s+cccd|so\s+cccd|số\s+cmnd|so\s+cmnd|căn\s+cước|can\s+cuoc|định\s+danh|dinh\s+danh|xác\s+thực|xac\s+thuc|là|la|số|so)\s*:?/gi,
        " "
    );
    t = t.replace(/[^a-zA-ZÀ-ỹ\s]/g, " ").replace(/\s+/g, " ").trim();
    return t;
}

/**
 * Xử lý xác thực cư dân qua file CSV tenants và gán Tag tự động.
 * ĐẢM BẢO QUY TẮC CỐT LÕI:
 * 1. GATEKEEPER 2 YẾU TỐ: Bắt buộc phải có cả Họ Tên VÀ Số CCCD hợp lệ thì mới tiến hành xác thực.
 * 2. Mỗi Tên + CCCD chỉ được liên kết 1 tag duy nhất (1 Zalo UID duy nhất).
 * 3. Mỗi tài khoản Zalo chỉ được nhận 1 tag phòng duy nhất.
 */
export async function handleCsvTenantClaim(
    userText: string,
    zaloUserId: string
): Promise<{ handled: boolean; replyText?: string; customButtons?: any[] }> {
    const session = getSession(zaloUserId) as any;
    const cccdInText = extractCccd(userText);

    let targetCccd = cccdInText;
    let candidateName = "";
    const isAwaitingName = session.pendingTenantVerification?.step === "AWAIT_NAME";

    // 1. Kiểm tra trạng thái chờ nhập tên từ hội thoại trước (AWAIT_NAME)
    if (!targetCccd && isAwaitingName) {
        targetCccd = session.pendingTenantVerification.cccd;
        candidateName = userText.trim();
    } else if (targetCccd) {
        candidateName = extractNameFromMessage(userText, targetCccd);
    }

    // Nếu không có số CCCD trong tin nhắn và cũng không trong trạng thái chờ -> không xử lý
    if (!targetCccd) {
        return { handled: false };
    }

    const cleanCccd = targetCccd.replace(/\D/g, "");
    const hasCccdKw = hasExplicitCccdKeyword(userText);
    const hasValidName = isValidFullName(candidateName);

    // GATEKEEPER TIỀN DUYỆT TIN NHẮN (TIẾT KIỆM API TUYỆT ĐỐI):
    // Nếu tin nhắn KHÔNG có từ khóa CCCD rõ ràng, KHÔNG có Tên hợp lệ và KHÔNG ở trạng thái chờ:
    // -> Đây là tin nhắn thông thường chứa chuỗi số (STK ngân hàng, mã đơn, công tơ...). Bỏ qua hoàn toàn (0 API calls).
    if (!isAwaitingName && !hasCccdKw && !hasValidName) {
        return { handled: false };
    }

    // BƯỚC 1: NẾU NGƯỜI DÙNG CHỈ MỚI GỬI SỐ CCCD MÀ CHƯA CÓ HỌ VÀ TÊN:
    // -> Lưu CCCD vào session và hỏi Tên trước, TUYỆT ĐỐI KHÔNG GỌI LARK BASE API!
    if (!hasValidName) {
        session.pendingTenantVerification = {
            cccd: cleanCccd,
            step: "AWAIT_NAME",
        };
        console.log(`[tenantCsvService] 🛡️ Gatekeeper: Đã ghi nhận CCCD ${cleanCccd}. Yêu cầu cư dân gửi Họ Tên để đối soát (0 API calls).`);
        return {
            handled: true,
            replyText: `Dạ, Quản gia AI đã nhận số CCCD ${cleanCccd}.\n\nĐể kích hoạt quyền cư dân tự động mở cửa, bạn vui lòng gửi thêm **Họ và tên** của bạn (đúng theo hợp đồng thuê phòng) nhé!`,
        };
    }

    // BƯỚC 2: ĐÃ CÓ ĐỦ CẢ HỌ TÊN VÀ SỐ CCCD HỢP LỆ!
    const tenants = loadTenantsFromCsv();

    if (tenants.length === 0) {
        console.warn("[tenantCsvService] Danh sách cư dân trong tenants.csv đang trống.");
        return {
            handled: true,
            replyText: `⚠️ Hệ thống đang cập nhật danh bạ cư dân. Bạn vui lòng liên hệ Ban Quản lý để được hỗ trợ mở quyền:\n📞 Hotline Admin: ${ADMIN_PHONE_NUMBER}`,
        };
    }

    // 2. Tra cứu CCCD trong CSV (Offline 0ms, 0 API calls)
    const matchedTenant = tenants.find((t) => t.cccd === cleanCccd);

    if (!matchedTenant) {
        return {
            handled: true,
            replyText: `⚠️ Không tìm thấy hồ sơ cư dân tương ứng với số CCCD ${cleanCccd} trong danh bạ tòa nhà.\n\nBạn vui lòng kiểm tra lại số CCCD hoặc liên hệ Ban Quản lý để được hỗ trợ nhé:\n📞 Hotline Admin: ${ADMIN_PHONE_NUMBER}`,
        };
    }

    // 3. KIỂM TRA RÀNG BUỘC CỐT LÕI: "Mỗi tên và CCCD chỉ set được 1 tag duy nhất"
    const activeLinks = getLocalActiveLinks();

    // 3.1 Kiểm tra xem CCCD này đã được gán cho Zalo UID nào chưa
    const existingBindingByCccd = Object.values(activeLinks).find((item: any) => {
        const itemCccd = String(item.cccd || "").replace(/\D/g, "");
        return itemCccd && itemCccd === cleanCccd;
    });

    if (existingBindingByCccd) {
        session.pendingTenantVerification = undefined;
        if (existingBindingByCccd.zaloUserId === zaloUserId) {
            return {
                handled: true,
                replyText: `Dạ, tài khoản Zalo của bạn đã được kích hoạt quyền Cư dân Phòng ${existingBindingByCccd.roomNumber} (Mã định danh: ${existingBindingByCccd.tagCode}) trước đó rồi ạ!\n\n👉 Bạn có thể nhắn "lấy mã mở cửa", "mở cổng" hoặc bấm nút dưới để nhận mã bất cứ lúc nào nhé.`,
                customButtons: [
                    { title: "🚪 Cửa to", payload: "Cửa to" },
                    { title: "🚶 Cửa nhỏ", payload: "Cửa nhỏ" },
                    { title: "🚗 Cửa gara", payload: "Cửa gara" },
                    { title: "🏠 Cửa phòng", payload: "Cửa phòng" },
                ],
            };
        } else {
            // Đã liên kết với một Zalo UID khác! TỪ CHỐI ĐỂ BẢO VỆ CHỐNG GHI ĐÈ
            return {
                handled: true,
                replyText: `⚠️ Hồ sơ cư dân của bạn (${matchedTenant.tenantName} - CCCD: ${cleanCccd}) đã được kích hoạt trên một tài khoản Zalo khác trước đó.\n\nTheo quy định bảo mật, mỗi hợp đồng thuê chỉ được liên kết với 1 tài khoản Zalo duy nhất.\nNếu bạn vừa đổi số điện thoại Zalo hoặc cần hỗ trợ chuyển quyền, vui lòng liên hệ Ban Quản lý:\n📞 Hotline Admin: ${ADMIN_PHONE_NUMBER}`,
            };
        }
    }

    // 3.2 Kiểm tra xem Zalo UID này đã được gán vào phòng khác chưa
    const existingBindingByUser = Object.values(activeLinks).find((item: any) => item.zaloUserId === zaloUserId);
    if (existingBindingByUser) {
        session.pendingTenantVerification = undefined;
        return {
            handled: true,
            replyText: `Dạ, tài khoản Zalo của bạn hiện đã được liên kết với Phòng ${existingBindingByUser.roomNumber} (Mã định danh: ${existingBindingByUser.tagCode}).\nNếu bạn chuyển phòng mới hoặc cần đổi thông tin, vui lòng báo Ban Quản lý để gỡ tag cũ trước nhé:\n📞 Hotline: ${ADMIN_PHONE_NUMBER}`,
        };
    }

    // 4. Nếu chưa có tên hoặc tên chưa được cung cấp -> Yêu cầu cư dân gửi Họ và tên để đối soát
    if (!candidateName || candidateName.length < 2) {
        session.pendingTenantVerification = {
            cccd: cleanCccd,
            step: "AWAIT_NAME",
        };
        return {
            handled: true,
            replyText: `Dạ, hệ thống đã ghi nhận số CCCD ${cleanCccd}.\n\nĐể hoàn tất xác thực quyền cư dân, bạn vui lòng gửi **Họ và tên** của bạn (đúng theo hợp đồng thuê phòng) nhé!`,
        };
    }

    // 5. Đối soát Họ và Tên với dữ liệu trong hợp đồng CSV
    if (!isNameMatch(candidateName, matchedTenant.tenantName)) {
        return {
            handled: true,
            replyText: `⚠️ Họ tên bạn cung cấp ("${candidateName}") chưa trùng khớp với hồ sơ đăng ký hợp đồng của CCCD ${cleanCccd}.\n\nBạn vui lòng kiểm tra lại chính xác họ tên có dấu/không dấu, hoặc liên hệ Hotline Ban Quản lý để được hỗ trợ nhé:\n📞 Hotline Admin: ${ADMIN_PHONE_NUMBER}`,
        };
    }

    // 6. XÁC THỰC THÀNH CÔNG -> LƯU LIÊN KẾT VÀ GÁN TAG
    const recordId = `csv_${cleanCccd}`;
    activeLinks[recordId] = {
        recordId,
        zaloUserId,
        tagCode: matchedTenant.tagCode,
        roomNumber: matchedTenant.roomNumber,
        tenantName: matchedTenant.tenantName,
        phone: matchedTenant.phone || "",
        cccd: cleanCccd,
        address: "38 Phan Bá Vành, P. Cát Lái, TP Hồ Chí Minh",
        role: matchedTenant.role,
        linkedAt: new Date().toISOString(),
    };
    saveLocalActiveLinks(activeLinks);

    // Cập nhật Session & Cache vai trò ngay lập tức (0ms)
    updateSessionContext(zaloUserId, {
        role: matchedTenant.role,
        roomNumber: matchedTenant.roomNumber,
        userName: matchedTenant.tenantName,
        tagCode: matchedTenant.tagCode,
        address: "38 Phan Bá Vành, P. Cát Lái, TP Hồ Chí Minh",
        phone: matchedTenant.phone || cleanCccd,
    });

    setCachedRole(zaloUserId, {
        zaloUserId,
        role: matchedTenant.role,
        tagCode: matchedTenant.tagCode,
        roomNumber: matchedTenant.roomNumber,
        address: "38 Phan Bá Vành, P. Cát Lái, TP Hồ Chí Minh",
        tenantName: matchedTenant.tenantName,
        phone: matchedTenant.phone || cleanCccd,
        cccd: cleanCccd,
    });

    // Đồng bộ Tag lên Zalo OA (Non-blocking)
    setUserTagInZalo(zaloUserId, matchedTenant.tagCode).catch((err) => {
        console.warn(`[tenantCsvService] Cảnh báo lỗi đồng bộ tag Zalo OA cho ${zaloUserId}:`, err.message);
    });

    // Xóa cờ chờ xác thực trong session
    session.pendingTenantVerification = undefined;

    console.log(
        `[tenantCsvService] ✅ Đã kích hoạt cư dân qua CSV: ${matchedTenant.tenantName} - Phòng ${matchedTenant.roomNumber} (${matchedTenant.tagCode}) cho Zalo UID: ${zaloUserId}`
    );

    // Gửi thông báo ngầm cho Admin
    const adminMsg = `🔔 [XÁC THỰC CƯ DÂN QUA CSV THÀNH CÔNG]\n• Cư dân: ${matchedTenant.tenantName}\n• Phòng: ${matchedTenant.roomNumber} (${matchedTenant.tagCode})\n• CCCD: ${cleanCccd}\n• SĐT: ${matchedTenant.phone || "Chưa có"}\n• Zalo UID: ${zaloUserId}\n• Thời gian: ${new Date().toLocaleString("vi-VN")}`;
    notifyAdmin(adminMsg).catch(() => {});

    // Phản hồi cho Cư dân kèm các nút cấp mã cửa nhanh
    return {
        handled: true,
        replyText: `🎉 Chúc mừng bạn ${matchedTenant.tenantName}! Hệ thống đã xác thực thông tin cư dân thành công.\n\n🏠 Bạn đã được kích hoạt quyền Cư dân Phòng ${matchedTenant.roomNumber} (Mã định danh: ${matchedTenant.tagCode}).\n\n🔑 Giờ bạn có thể nhắn tin "lấy mã mở cửa", "mở cổng", "mở phòng" hoặc bấm các nút bên dưới để Quản gia AI tạo mã PIN vào cửa tự động nhé!`,
        customButtons: [
            { title: "🚪 Cửa to", payload: "Cửa to" },
            { title: "🚶 Cửa nhỏ", payload: "Cửa nhỏ" },
            { title: "🚗 Cửa gara", payload: "Cửa gara" },
            { title: "🏠 Cửa phòng", payload: "Cửa phòng" },
        ],
    };
}

/**
 * Thư mục sao lưu các phiên bản file CSV cũ
 */
const BACKUP_DIR = path.resolve(process.cwd(), "data", "backups");

/**
 * Kiểm tra tính hợp lệ và đếm số lượng bản ghi của chuỗi nội dung CSV
 */
export function validateAndParseCsvContent(content: string): {
    valid: boolean;
    error?: string;
    tenants: CsvTenant[];
    roomCount: number;
} {
    let clean = content;
    // Loại bỏ BOM nếu có (UTF-8 BOM: \uFEFF)
    if (clean.charCodeAt(0) === 0xfeff) {
        clean = clean.slice(1);
    }

    const lines = clean.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) {
        return { valid: false, error: "File CSV trống hoặc chỉ có dòng tiêu đề, không có dữ liệu cư dân.", tenants: [], roomCount: 0 };
    }

    const headerLine = lines[0];
    const delimiter = headerLine.includes(";") && !headerLine.includes(",") ? ";" : ",";
    const headers = parseCsvLine(headerLine, delimiter).map((h) =>
        removeVietnameseDiacritics(h.toLowerCase()).replace(/[^a-z0-9]/g, "")
    );

    const nameIdx = headers.findIndex(
        (h) => h.includes("hovaten") || h === "ten" || h === "name" || (h.includes("ten") && !h.startsWith("ma"))
    );
    const cccdIdx = headers.findIndex((h) => h.includes("cccd") || h.includes("cmnd") || h.includes("dinhdanh"));
    const roomIdx = headers.findIndex((h) => h.includes("phong") || h.includes("room"));
    const buildingIdx = headers.findIndex((h) => h.includes("toanha") || h.includes("building"));
    const phoneIdx = headers.findIndex((h) => h.includes("sdt") || h.includes("dienthoai") || h.includes("phone"));
    const roleIdx = headers.findIndex((h) => h.includes("vaitro") || h.includes("role"));

    const missingColumns: string[] = [];
    if (nameIdx === -1) missingColumns.push("Họ và tên");
    if (cccdIdx === -1) missingColumns.push("Số CCCD/CMND");
    if (roomIdx === -1) missingColumns.push("Số phòng");

    if (missingColumns.length > 0) {
        return {
            valid: false,
            error: `File CSV thiếu các cột bắt buộc: [${missingColumns.join(", ")}]. Vui lòng kiểm tra lại file xuất từ hệ thống.`,
            tenants: [],
            roomCount: 0,
        };
    }

    const tenants: CsvTenant[] = [];
    const rooms = new Set<string>();

    for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i], delimiter);
        if (cols.length <= Math.max(nameIdx, cccdIdx, roomIdx)) continue;

        const rawName = cols[nameIdx] || "";
        const rawCccd = (cols[cccdIdx] || "").replace(/\D/g, "");
        const rawRoom = cols[roomIdx] || "";
        const rawBuilding = buildingIdx !== -1 && cols[buildingIdx] ? cols[buildingIdx] : "38PBV";
        const rawPhone = phoneIdx !== -1 && cols[phoneIdx] ? cols[phoneIdx].replace(/\D/g, "") : undefined;
        const rawRole = roleIdx !== -1 && cols[roleIdx] ? cols[roleIdx] : "PRIMARY_LEASEHOLDER";

        if (!rawName || !rawCccd) continue;

        const roomMatch = rawRoom.match(/\d{3,4}/);
        const roomNumber = roomMatch ? roomMatch[0] : rawRoom.replace(/[^a-zA-Z0-9]/g, "");
        let building = (rawBuilding.trim() || "38PBV").toUpperCase();
        if (!building || building === "TEST") {
            building = "38PBV";
        }
        const tagCode = `${building}-${roomNumber}`;

        const normRole = removeVietnameseDiacritics(rawRole);
        const role: "PRIMARY_LEASEHOLDER" | "CO_RESIDENT" =
            normRole.includes("cung") || normRole.includes("phu") || normRole.includes("resident") || normRole.includes("con")
                ? "CO_RESIDENT"
                : "PRIMARY_LEASEHOLDER";

        tenants.push({
            tenantName: rawName.trim(),
            cccd: rawCccd,
            roomNumber,
            tagCode,
            building,
            phone: rawPhone,
            role,
        });
        if (roomNumber) rooms.add(roomNumber);
    }

    if (tenants.length === 0) {
        return {
            valid: false,
            error: "Không tìm thấy dòng cư dân hợp lệ nào (Cần ít nhất Họ tên và Số CCCD).",
            tenants: [],
            roomCount: 0,
        };
    }

    return {
        valid: true,
        tenants,
        roomCount: rooms.size,
    };
}

/**
 * Tự động tạo bản sao lưu (Backup) file tenants.csv hiện tại
 */
export function backupCurrentTenantsCsv(): string | null {
    try {
        if (!fs.existsSync(TENANTS_CSV_FILE)) {
            return null;
        }

        if (!fs.existsSync(BACKUP_DIR)) {
            fs.mkdirSync(BACKUP_DIR, { recursive: true });
        }

        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, "0");
        const d = String(now.getDate()).padStart(2, "0");
        const h = String(now.getHours()).padStart(2, "0");
        const min = String(now.getMinutes()).padStart(2, "0");
        const s = String(now.getSeconds()).padStart(2, "0");
        const backupFileName = `tenants_${y}${m}${d}_${h}${min}${s}.csv`;
        const backupPath = path.join(BACKUP_DIR, backupFileName);

        fs.copyFileSync(TENANTS_CSV_FILE, backupPath);
        console.log(`[tenantCsvService] 🗄️ Đã sao lưu tenants.csv thành công: ${backupFileName}`);

        // Giới hạn lưu tối đa 15 bản backup gần nhất, xóa bớt bản cũ
        const allBackups = fs.readdirSync(BACKUP_DIR)
            .filter((f) => f.startsWith("tenants_") && f.endsWith(".csv"))
            .sort();
        if (allBackups.length > 15) {
            const toDelete = allBackups.slice(0, allBackups.length - 15);
            for (const oldFile of toDelete) {
                try { fs.unlinkSync(path.join(BACKUP_DIR, oldFile)); } catch {}
            }
        }

        return backupFileName;
    } catch (err: any) {
        console.warn("[tenantCsvService] Không thể sao lưu file tenants.csv cũ:", err.message);
        return null;
    }
}

/**
 * Xử lý file CSV do Admin gửi qua Zalo OA:
 * 1. Tải file từ Zalo CDN
 * 2. Validate cấu trúc và dữ liệu
 * 3. Tự động backup file cũ
 * 4. Ghi đè vào data/tenants.csv
 * 5. Tự động nạp lại RAM Cache 0ms và đồng bộ active-links
 * 6. Trả về thông báo kết quả chi tiết cho Admin
 */
export async function handleAdminCsvUpload(params: {
    fileUrl: string;
    fileName: string;
    adminUserId: string;
}): Promise<{ success: boolean; message: string; tenantCount?: number; roomCount?: number }> {
    const { fileUrl, fileName, adminUserId } = params;

    // 1. Kiểm tra phần mở rộng file (Phải là file .csv)
    const lowerName = fileName.toLowerCase();
    if (!lowerName.endsWith(".csv") && !lowerName.endsWith(".txt")) {
        return {
            success: false,
            message: `⚠️ File gửi lên ("${fileName}") không phải định dạng CSV.\n\nBạn vui lòng xuất file từ bảng quản lý với định dạng .csv rồi gửi lại nhé!`,
        };
    }

    try {
        console.log(`[tenantCsvService] 📥 Đang tải file CSV từ Zalo CDN: ${fileName}...`);
        const res = await axios.get(fileUrl, {
            responseType: "arraybuffer",
            timeout: 20000,
        });

        const rawContent = Buffer.from(res.data).toString("utf-8");

        // 2. Kiểm tra tính hợp lệ của cấu trúc CSV
        const validation = validateAndParseCsvContent(rawContent);
        if (!validation.valid) {
            return {
                success: false,
                message: `⚠️ File CSV "${fileName}" không hợp lệ:\n• ${validation.error}\n\nHệ thống đã giữ nguyên danh bạ cư dân hiện tại để đảm bảo an toàn.`,
            };
        }

        // 3. Sao lưu file cũ trước khi ghi đè
        const backupName = backupCurrentTenantsCsv();

        // 4. Ghi đè file mới vào data/tenants.csv
        const targetDir = path.dirname(TENANTS_CSV_FILE);
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }
        fs.writeFileSync(TENANTS_CSV_FILE, rawContent, "utf-8");

        // 5. Hot-Reload bộ nhớ đệm RAM tức thì (0ms) và đồng bộ active-links
        loadTenantsFromCsv(true);
        syncActiveLinksWithCsv();

        const timeStr = new Date().toLocaleString("vi-VN");
        const backupNote = backupName ? `\n• Bản sao lưu an toàn: ${backupName}` : "";

        console.log(`[tenantCsvService] 🎉 Admin ${adminUserId} đã cập nhật thành công danh bạ từ "${fileName}" (${validation.tenants.length} cư dân, ${validation.roomCount} phòng).`);

        return {
            success: true,
            tenantCount: validation.tenants.length,
            roomCount: validation.roomCount,
            message: `✅ CẬP NHẬT DANH BẠ CƯ DÂN THÀNH CÔNG!\n\n📁 Tên file: ${fileName}\n👥 Tổng số cư dân: ${validation.tenants.length} người\n🏠 Số phòng quản lý: ${validation.roomCount} phòng\n⚡ Bộ nhớ đệm (RAM Cache): Đã làm mới tức thì (Hot-Reload)${backupNote}\n⏰ Thời gian áp dụng: ${timeStr}\n\n👉 Danh bạ mới đã sẵn sàng cho cư dân tra cứu và nhận hóa đơn tự động!`,
        };
    } catch (err: any) {
        console.error(`[tenantCsvService] Lỗi khi xử lý file CSV từ Admin:`, err.message);
        return {
            success: false,
            message: `❌ Lỗi khi tải hoặc xử lý file CSV: ${err.message}. Hệ thống đã giữ nguyên danh bạ hiện tại.`,
        };
    }
}
