import fs from "fs";
import path from "path";
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
 * Đọc và phân tích file tenants.csv
 */
export function loadTenantsFromCsv(): CsvTenant[] {
    if (!fs.existsSync(TENANTS_CSV_FILE)) {
        console.warn(`[tenantCsvService] ⚠️ Không tìm thấy file tenants.csv tại: ${TENANTS_CSV_FILE}`);
        return [];
    }

    try {
        let content = fs.readFileSync(TENANTS_CSV_FILE, "utf-8");
        // Loại bỏ BOM nếu có (UTF-8 BOM: \uFEFF)
        if (content.charCodeAt(0) === 0xfeff) {
            content = content.slice(1);
        }

        const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        if (lines.length < 2) {
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

        return tenants;
    } catch (err: any) {
        console.error("[tenantCsvService] Lỗi khi đọc file CSV:", err.message);
        return [];
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

/**
 * Trích xuất tên từ tin nhắn khi người dùng gửi kèm cả tên và CCCD
 * Ví dụ: "Nguyễn Văn A 079201001234", "Tôi tên Nguyễn Văn A, số cccd: 079201001234"
 */
function extractNameFromMessage(text: string, cccd: string): string {
    let t = text;
    // Bỏ số CCCD
    t = t.replace(cccd, "");
    // Bỏ các từ khóa nhãn
    t = t.replace(/(?:toi\s+ten|toi\s+la|ten\s+toi\s+la|ho\s+va\s+ten|ho\s+ten|ten|cccd|cmnd|so\s+cccd|so\s+cmnd|can\s+cuoc|dinh\s+danh|la|so)\s*:?/gi, " ");
    t = t.replace(/[^a-zA-ZÀ-ỹ\s]/g, " ").replace(/\s+/g, " ").trim();
    return t;
}

/**
 * Xử lý xác thực cư dân qua file CSV tenants và gán Tag tự động.
 * ĐẢM BẢO QUY TẮC CỐT LÕI:
 * 1. Mỗi Tên + CCCD chỉ được liên kết 1 tag duy nhất (1 Zalo UID duy nhất).
 * 2. Mỗi tài khoản Zalo chỉ được nhận 1 tag phòng duy nhất.
 */
export async function handleCsvTenantClaim(
    userText: string,
    zaloUserId: string
): Promise<{ handled: boolean; replyText?: string; customButtons?: any[] }> {
    const session = getSession(zaloUserId) as any;
    const cccdInText = extractCccd(userText);

    let targetCccd = cccdInText;
    let candidateName = "";

    // 1. Kiểm tra trạng thái chờ nhập tên từ hội thoại trước (AWAIT_NAME)
    if (!targetCccd && session.pendingTenantVerification?.step === "AWAIT_NAME") {
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
    const tenants = loadTenantsFromCsv();

    if (tenants.length === 0) {
        console.warn("[tenantCsvService] Danh sách cư dân trong tenants.csv đang trống.");
        return {
            handled: true,
            replyText: `⚠️ Hệ thống đang cập nhật danh bạ cư dân. Bạn vui lòng liên hệ Ban Quản lý để được hỗ trợ mở quyền:\n📞 Hotline Admin: ${ADMIN_PHONE_NUMBER}`,
        };
    }

    // 2. Tra cứu CCCD trong CSV
    const matchedTenant = tenants.find((t) => t.cccd === cleanCccd);

    if (!matchedTenant) {
        return {
            handled: true,
            replyText: `⚠️ Không tìm thấy hồ sơ cư dân tương ứng với số CCCD ${cleanCccd} trong hệ thống tòa nhà.\n\nBạn vui lòng kiểm tra lại số CCCD hoặc liên hệ Ban Quản lý để được hỗ trợ nhé:\n📞 Hotline Admin: ${ADMIN_PHONE_NUMBER}`,
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
