export interface Message {
    role: "user" | "assistant";
    content: string;
    timestamp: number;
}

export interface UserSession {
    userId: string;
    roomNumber?: string;
    userName?: string;
    phone?: string;
    role?: "ADMIN" | "PRIMARY_LEASEHOLDER" | "CO_RESIDENT" | "UNTAGGED_GUEST";
    tagCode?: string;
    address?: string;
    history: Message[];
    updatedAt: number;
}

// Map lưu trữ session theo userId trong RAM
const sessions = new Map<string, UserSession>();

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 phút
const MAX_HISTORY_LENGTH = 10; // Giới hạn 10 tin nhắn gần nhất

/**
 * Lấy session của user. Nếu chưa có sẽ tạo mới.
 */
export function getSession(userId: string): UserSession {
    let session = sessions.get(userId);
    const now = Date.now();

    if (!session) {
        session = {
            userId,
            history: [],
            updatedAt: now,
        };
        sessions.set(userId, session);
    } else {
        // Cập nhật thời điểm tương tác mới nhất
        session.updatedAt = now;
    }

    return session;
}

/**
 * Thêm tin nhắn (user hoặc assistant) vào lịch sử hội thoại của session.
 */
export function addMessageToSession(userId: string, role: "user" | "assistant", content: string): void {
    const session = getSession(userId);
    session.history.push({
        role,
        content: content.trim(),
        timestamp: Date.now(),
    });

    // Giữ lại tối đa MAX_HISTORY_LENGTH tin nhắn mới nhất
    if (session.history.length > MAX_HISTORY_LENGTH) {
        session.history = session.history.slice(-MAX_HISTORY_LENGTH);
    }

    session.updatedAt = Date.now();
}

/**
 * Cập nhật thông tin ngữ cảnh khách hàng (ví dụ: số phòng, tên, số điện thoại).
 */
export function updateSessionContext(
    userId: string,
    context: {
        roomNumber?: string;
        userName?: string;
        phone?: string;
        role?: "ADMIN" | "PRIMARY_LEASEHOLDER" | "CO_RESIDENT" | "UNTAGGED_GUEST";
        tagCode?: string;
        address?: string;
    }
): void {
    const session = getSession(userId);
    if (context.roomNumber) {
        session.roomNumber = context.roomNumber;
    }
    if (context.userName) {
        session.userName = context.userName;
    }
    if (context.phone) {
        session.phone = context.phone;
    }
    if (context.role) {
        session.role = context.role;
    }
    if (context.tagCode) {
        session.tagCode = context.tagCode;
    }
    if (context.address) {
        session.address = context.address;
    }
    session.updatedAt = Date.now();
}

/**
 * Lấy lịch sử hội thoại gần nhất dưới dạng danh sách tin nhắn.
 */
export function getRecentHistory(userId: string, limit: number = 6): Message[] {
    const session = getSession(userId);
    return session.history.slice(-limit);
}

/**
 * Xóa các session đã hết hạn tương tác (TTL).
 */
export function clearExpiredSessions(ttlMs: number = DEFAULT_TTL_MS): number {
    const now = Date.now();
    let deletedCount = 0;

    for (const [userId, session] of sessions.entries()) {
        if (now - session.updatedAt > ttlMs) {
            sessions.delete(userId);
            deletedCount++;
        }
    }

    return deletedCount;
}

/**
 * Xóa thủ công session (dùng cho testing/reset).
 */
export function clearSession(userId: string): void {
    sessions.delete(userId);
}
