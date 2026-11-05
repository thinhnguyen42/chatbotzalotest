/**
 * CƠ SỞ DỮ LIỆU TRI THỨC SỔ TAY SINH VIÊN ĐẠI HỌC MỞ (OU)
 * Phục vụ hỏi đáp tự động về Quy chế học vụ, Học bổng, Học phí, Điểm rèn luyện và Phòng ban liên hệ.
 */

export interface HandbookArticle {
    id: string;
    topic: string;
    title: string;
    keywords: string[];
    summary: string;
    content: string;
    relatedLinks?: { label: string; url: string }[];
}

export const HANDBOOK_TOPICS = [
    { code: "HOC_VU", name: "📚 Quy chế học vụ & Tín chỉ" },
    { code: "DANG_KY_MON", name: "📝 Đăng ký học phần" },
    { code: "HOC_BONG_HOC_PHI", name: "💰 Học phí & Học bổng" },
    { code: "DIEM_REN_LUYEN", name: "⭐ Điểm rèn luyện & Hoạt động" },
    { code: "PHONG_BAN", name: "🏛️ Phòng ban & Liên hệ" },
    { code: "TOT_NGHIEP", name: "🎓 Chuẩn đầu ra & Tốt nghiệp" },
];

export const HANDBOOK_ARTICLES: HandbookArticle[] = [
    {
        id: "HV-01",
        topic: "HOC_VU",
        title: "Thang điểm và cách tính điểm trung bình (GPA/CPA)",
        keywords: ["thang điểm", "gpa", "cpa", "điểm chữ", "điểm hệ 4", "tính điểm", "điểm trung bình", "điểm f", "điểm d", "điểm a"],
        summary: "Đại học Mở áp dụng thang điểm 10 quy đổi sang thang điểm chữ (A, B+, B, C+, C, D+, D, F) và thang điểm 4 để tính GPA.",
        content: `1. Quy đổi điểm từ thang 10 sang thang điểm chữ & thang 4:
• 8.5 - 10.0: Điểm A (4.0) - Giỏi / Xuất sắc
• 8.0 - 8.4: Điểm B+ (3.5) - Khá giỏi
• 7.0 - 7.9: Điểm B (3.0) - Khá
• 6.5 - 6.9: Điểm C+ (2.5) - Trung bình khá
• 5.5 - 6.4: Điểm C (2.0) - Trung bình
• 5.0 - 5.4: Điểm D+ (1.5) - Trung bình yếu
• 4.0 - 4.9: Điểm D (1.0) - Đạt (Yếu)
• Dưới 4.0: Điểm F (0.0) - Không đạt (Rớt môn)

2. Cách tính GPA / CPA:
• GPA (Grade Point Average): Điểm trung bình học kỳ, tính bằng tổng (Điểm hệ 4 × Số tín chỉ) / Tổng số tín chỉ học kỳ.
• CPA (Cumulative Point Average): Điểm trung bình tích lũy từ đầu khóa học.
• Học phần bị điểm F không được tính tích lũy tín chỉ nhưng vẫn tính vào GPA học kỳ cho đến khi học lại đạt.`,
    },
    {
        id: "HV-02",
        topic: "HOC_VU",
        title: "Cảnh báo học vụ và Buộc thôi học",
        keywords: ["cảnh báo học vụ", "bị cảnh báo", "buộc thôi học", "đuổi học", "hạ điểm", "hạn ngạch", "rớt môn nhiều"],
        summary: "Sinh viên bị cảnh báo học vụ nếu GPA < 1.0 (năm 1) hoặc < 1.2 (năm sau). Bị cảnh báo 2 lần liên tiếp sẽ bị buộc thôi học.",
        content: `1. Các trường hợp bị CẢNH BÁO HỌC VỤ:
• Điểm trung bình học kỳ (GPA) đạt dưới 1.0 đối với học kỳ đầu của khóa học.
• GPA đạt dưới 1.2 đối với các học kỳ tiếp theo.
• Tổng số tín chỉ nợ đọng vượt quá quy định của trường (quá 24 tín chỉ).

2. Trường hợp bị BUỘC THÔI HỌC:
• Bị cảnh báo học vụ 02 lần liên tiếp.
• Vượt quá thời gian tối đa được phép học tập tại trường (Thời gian thiết kế + 4 học kỳ đối với chương trình 4 năm).
• Tự ý bỏ học không có lý do chính đáng quá 01 học kỳ.

💡 Lời khuyên: Khi nhận cảnh báo học vụ lần 1, sinh viên cần liên hệ ngay Cố vấn học tập hoặc Phòng QLĐT để được tư vấn giảm tải số tín chỉ học kỳ tiếp theo.`,
    },
    {
        id: "DKM-01",
        topic: "DANG_KY_MON",
        title: "Quy trình đăng ký, rút bớt và hủy học phần",
        keywords: ["đăng ký học phần", "rút môn", "hủy môn", "đăng ký môn", "học vượt", "học cải thiện", "học lại"],
        summary: "Sinh viên đăng ký môn qua cổng SIS online. Có thể rút học phần trong 2 tuần đầu học kỳ (nhận điểm W).",
        content: `1. Thời gian & Hình thức đăng ký:
• Thực hiện trực tuyến trên Cổng thông tin đào tạo (SIS OU).
• Mỗi học kỳ có 3 đợt: Đăng ký chính thức (theo tiến độ khóa), Đăng ký bổ sung/học ghép/học vượt, và Điều chỉnh hủy môn.

2. Số tín chỉ tối thiểu & tối đa:
• Học kỳ chính: Tối thiểu 14 tín chỉ (trừ học kỳ cuối), tối đa 24 tín chỉ (sinh viên khá giỏi có thể đăng ký tối đa 28 tín chỉ).
• Học kỳ hè: Tối đa 12 tín chỉ.

3. Rút / Hủy học phần:
• Rút học phần trong 02 tuần đầu học kỳ: Môn học sẽ được ghi điểm W (Withdraw), không tính vào GPA, không được hoàn trả học phí.
• Quá thời hạn trên, sinh viên không đi học và không thi sẽ nhận điểm F.`,
    },
    {
        id: "HB-01",
        topic: "HOC_BONG_HOC_PHI",
        title: "Điều kiện xét Học bổng khuyến khích học tập OU",
        keywords: ["học bổng", "xét học bổng", "học bổng khuyến khích", "điều kiện học bổng", "tiền học bổng", "điểm xét học bổng"],
        summary: "Xét theo học kỳ chính dựa trên cả Điểm học tập (GPA >= 2.5) và Điểm rèn luyện (ĐRL >= 70), không có môn thi lại/F.",
        content: `1. Điều kiện tham gia xét học bổng:
• Đăng ký tối thiểu 15 tín chỉ trong học kỳ xét (không tính học kỳ hè).
• Không có học phần nào bị điểm F hoặc phải thi lại trong học kỳ đó.
• Điểm rèn luyện đạt từ loại Khá trở lên (ĐRL >= 70 điểm).

2. Các mức học bổng khuyến khích học tập:
• Loại Xuất sắc: GPA >= 3.60 VÀ ĐRL >= 90 điểm (Mức học bổng cao nhất, 120% - 150% học phí).
• Loại Giỏi: GPA từ 3.20 đến 3.59 VÀ ĐRL >= 80 điểm (100% học phí).
• Loại Khá: GPA từ 2.80 đến 3.19 VÀ ĐRL >= 70 điểm (50% - 70% học phí).

📌 Lưu ý: Học bổng được xét từ trên xuống dưới theo quỹ học bổng của từng Khoa/Ngành cho đến khi hết chỉ tiêu.`,
    },
    {
        id: "HB-02",
        topic: "HOC_BONG_HOC_PHI",
        title: "Quy định nộp và gia hạn học phí",
        keywords: ["học phí", "nộp học phí", "gia hạn học phí", "đóng tiền học", "miễn giảm học phí", "chậm nộp học phí"],
        summary: "Sinh viên đóng học phí qua cổng thanh toán trực tuyến hoặc ngân hàng. Có hoàn cảnh khó khăn được làm đơn gia hạn.",
        content: `1. Thời hạn và cách thức đóng học phí:
• Đóng học phí theo thông báo của Nhà trường ở đầu mỗi học kỳ (thường trước tuần thứ 4 của kỳ học).
• Đóng trực tuyến qua Cổng thanh toán sinh viên (VNPAY / VietinBank / MoMo) hoặc chuyển khoản theo cú pháp: [MSSV] - [Họ tên] - [HK...].

2. Đơn xin gia hạn nộp học phí:
• Sinh viên có hoàn cảnh khó khăn chưa kịp đóng đúng hạn cần làm 'Đơn xin gia hạn học phí' nộp về Phòng Công tác Sinh viên (CTSV) trước ngày hết hạn.
• Thời gian gia hạn tối đa không quá 30 ngày so với hạn chót.
• Sinh viên nợ học phí không được gia hạn sẽ bị khóa tài khoản đăng ký môn và không có tên trong danh sách dự thi.`,
    },
    {
        id: "DRL-01",
        topic: "DIEM_REN_LUYEN",
        title: "Đánh giá Điểm rèn luyện và Khung xếp loại",
        keywords: ["điểm rèn luyện", "drl", "đánh giá rèn luyện", "hoạt động đoàn", "cộng điểm", "xếp loại rèn luyện"],
        summary: "Điểm rèn luyện đánh giá trên thang 100 điểm với 5 tiêu chí: Học tập, Ý thức nội quy, Hoạt động xã hội, Cộng đồng, Phụ trách lớp.",
        content: `1. Khung thang điểm rèn luyện (Thang 100):
• Tiêu chí 1: Ý thức học tập (Tối đa 20 điểm).
• Tiêu chí 2: Ý thức chấp hành nội quy, quy chế trường lớp (Tối đa 25 điểm).
• Tiêu chí 3: Ý thức tham gia hoạt động chính trị, xã hội, văn thể mỹ (Tối đa 20 điểm).
• Tiêu chí 4: Phẩm chất công dân và quan hệ cộng đồng (Tối đa 25 điểm).
• Tiêu chí 5: Ý thức tham gia công tác phụ trách lớp, đoàn thể (Tối đa 10 điểm).

2. Khung xếp loại rèn luyện:
• 90 - 100 điểm: Xuất sắc
• 80 - 89 điểm: Tốt
• 65 - 79 điểm: Khá
• 50 - 64 điểm: Trung bình
• Dưới 50 điểm: Yếu / Kém

💡 Điểm rèn luyện là điều kiện bắt buộc để xét học bổng, xét khen thưởng, giao lưu quốc tế và xét tốt nghiệp ra trường.`,
    },
    {
        id: "PB-01",
        topic: "PHONG_BAN",
        title: "Danh bạ các Phòng ban hỗ trợ Sinh viên OU",
        keywords: ["phòng ban", "liên hệ", "phòng đào tạo", "phòng công tác sinh viên", "ctsv", "khảo thí", "đoàn trường", "hotline"],
        summary: "Thông tin liên hệ các phòng ban chức năng chính: Phòng Đào tạo (QLĐT), Phòng Công tác Sinh viên (CTSV), Phòng Khảo thí.",
        content: `1. Phòng Quản lý Đào tạo (QLĐT):
• Chức năng: Đăng ký học phần, chương trình đào tạo, cấp bảng điểm, xét tốt nghiệp, chuyển ngành.
• Địa chỉ: Cơ sở 97 Võ Văn Tần, P. Võ Thị Sáu, Q.3, TP.HCM (Phòng 007).
• Email: phongdaotao@ou.edu.vn | Hotline: (028) 3930 0072.

2. Phòng Công tác Sinh viên (CTSV):
• Chức năng: Thẻ sinh viên, Giấy xác nhận sinh viên, Học bổng, BHYT, ĐRL, Ký túc xá, Gia hạn học phí.
• Địa chỉ: Cơ sở 97 Võ Văn Tần (Phòng 003).
• Email: ctsv@ou.edu.vn | Hotline: (028) 3930 2146.

3. Phòng Khảo thí & Đảm bảo chất lượng:
• Chức năng: Lịch thi học kỳ, địa điểm thi, phúc khảo bài thi, hoãn thi.
• Email: phongkhaothi@ou.edu.vn | Website: khaothi.ou.edu.vn.

4. Đoàn Thanh niên - Hội Sinh viên:
• Chức năng: Hoạt động tình nguyện (Mùa hè xanh, Tiếp sức mùa thi), Ngày thứ 7 tình nguyện, CLB đội nhóm.
• Email: doan-hoisinhvien@ou.edu.vn.`,
    },
];

/**
 * Tìm kiếm bài viết sổ tay phù hợp theo từ khóa / câu hỏi của sinh viên
 */
export function searchHandbookArticles(query: string): HandbookArticle[] {
    const cleanQuery = query.toLowerCase().trim();
    if (!cleanQuery) return [];

    const scored = HANDBOOK_ARTICLES.map((article) => {
        let score = 0;

        // Khớp tiêu đề
        if (article.title.toLowerCase().includes(cleanQuery)) {
            score += 10;
        }

        // Khớp từ khóa
        for (const kw of article.keywords) {
            if (cleanQuery.includes(kw.toLowerCase())) {
                score += 5;
            }
        }

        // Khớp tóm tắt hoặc nội dung
        if (article.summary.toLowerCase().includes(cleanQuery)) {
            score += 3;
        }

        // Tách từng từ đơn
        const words = cleanQuery.split(/\s+/).filter((w) => w.length > 2);
        for (const word of words) {
            if (article.title.toLowerCase().includes(word)) score += 2;
            if (article.keywords.some((kw) => kw.toLowerCase().includes(word))) score += 1.5;
            if (article.summary.toLowerCase().includes(word)) score += 0.5;
        }

        return { article, score };
    });

    return scored
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((item) => item.article);
}
