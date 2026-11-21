/**
 * CƠ SỞ DỮ LIỆU TRI THỨC SỔ TAY SINH VIÊN TRƯỜNG ĐẠI HỌC MỞ TP.HCM (OU)
 * Nguồn: D:\So tay SV 2025.pdf (Sổ tay sinh viên ĐH chính quy - QĐ số 2289/QĐ-ĐHM ngày 19/09/2024).
 */

import { removeVietnameseDiacritics } from "../utils/textUtils";

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
    { code: "GIOI_THIEU", name: "🏫 Cơ sở học tập & Hệ thống SV" },
    { code: "HOC_VU", name: "📚 Quy chế học vụ & Điểm số" },
    { code: "DANG_KY_MON", name: "📝 Đăng ký môn & Lịch thi" },
    { code: "CHUAN_DAU_RA", name: "🎓 Chuẩn đầu ra & Tốt nghiệp" },
    { code: "HOC_BONG_HOC_PHI", name: "💰 Học phí, Học bổng & Chính sách" },
    { code: "DIEM_REN_LUYEN", name: "⭐ Điểm rèn luyện, Ngoại trú & Nội quy" },
    { code: "PHONG_BAN", name: "🏛️ Danh bạ Phòng ban & Khoa" },
];

export const HANDBOOK_ARTICLES: HandbookArticle[] = [
    {
        id: "GT-01",
        topic: "GIOI_THIEU",
        title: "Giới thiệu chung Trường Đại học Mở TP.HCM (OU)",
        keywords: [
            "giới thiệu", "đại học mở", "triết lý giáo dục", "sứ mạng", "tầm nhìn",
            "ban giám hiệu", "hiệu trưởng", "tiếp công dân", "hồ hảo hớn", "trụ sở chính",
        ],
        summary: "Trường ĐH Mở TP.HCM (công lập từ 2006, trụ sở 35-37 Hồ Hảo Hớn, Q.1) đào tạo theo 4 trụ cột: Nhân bản, Rộng mở, Thực tiễn và Hội nhập.",
        content: `1. Thông tin chung:
• Tên tiếng Anh: Ho Chi Minh City Open University (Loại hình Trường Công lập từ năm 2006, trực thuộc Bộ GD&ĐT).
• Trụ sở chính: 35-37 Hồ Hảo Hớn, P. Cô Giang, Quận 1, TP.HCM.
• Website: https://ou.edu.vn | Email: ou@ou.edu.vn | ĐT: (028) 38364748.

2. Triết lý giáo dục & Ban Giám hiệu:
• 4 trụ cột giáo dục: Nhân bản – Rộng mở – Thực tiễn – Hội nhập.
• Chủ tịch Hội đồng trường: TS. Đỗ Sa Kỳ.
• Hiệu trưởng: GS.TS. Nguyễn Minh Hà | Phó Hiệu trưởng: TS.GVCC. Lê Xuân Trường, TS. Lê Nguyễn Quốc Khang.
• Lịch tiếp công dân của Hiệu trưởng: Thứ Hai tuần đầu tháng tại Phòng Tiếp công dân (35-37 Hồ Hảo Hớn, Q.1).`,
    },
    {
        id: "GT-02",
        topic: "GIOI_THIEU",
        title: "Các cơ sở học tập, ký hiệu phòng học & khung giờ ra vào lớp",
        keywords: [
            "cơ sở", "địa điểm học", "ký hiệu phòng", "phòng học", "khung giờ", "giờ học",
            "tiết học", "võ văn tần", "hồ hảo hớn", "nhà bè", "mai thị lựu", "bình dương",
            "long bình tân", "biên hòa", "nb", "hh", "ml", "bd", "lb",
        ],
        summary: "Trường có 6 cơ sở học tập (ký hiệu A, HH, NB, ML, BD, LB). Khung giờ học chia theo cụm 97 VVT/02 MTL và cụm Nhà Bè/Bình Dương/Long Bình Tân.",
        content: `1. Các địa điểm học tập & Ký hiệu phòng học:
• Cơ sở 1 (Ký hiệu A...): 97 Võ Văn Tần, P. Võ Thị Sáu, Quận 3, TP.HCM.
• Cơ sở 2 (Ký hiệu HH...): 35-37 Hồ Hảo Hớn, P. Cô Giang, Quận 1, TP.HCM.
• Cơ sở 3 (Ký hiệu NB...): Xã Nhơn Đức, huyện Nhà Bè, TP.HCM.
• Cơ sở 4 (Ký hiệu ML...): 02 Mai Thị Lựu, P. Đa Kao, Quận 1, TP.HCM.
• Cơ sở 5 (Ký hiệu BD...): 68 Lê Thị Trung, P. Phú Lợi, TP. Thủ Dầu Một, Bình Dương.
• Cơ sở 6 (Ký hiệu LB...): Đường cổng 9, KP.1, P. Long Bình Tân, TP. Biên Hòa, Đồng Nai.

2. Khung thời gian học (áp dụng từ năm học 2024-2025):
• Tại 97 Võ Văn Tần & 02 Mai Thị Lựu (Sáng): Tiết 1 (7:00-7:50), Tiết 2 (7:50-8:40), Tiết 3 (8:40-9:05 | giải lao 9:05-9:20 | 9:20-9:45), Tiết 4 (9:45-10:35), Tiết 5 (10:35-11:25).
• Tại Nhà Bè, Bình Dương & Long Bình Tân:
  - Sáng: 7:30 - 11:55 (Tiết 1 từ 7:30, giải lao 9:35-9:50).
  - Chiều: 13:00 - 17:25 (giải lao 15:05-15:20; lớp thực hành chia nhóm bắt đầu 12:45-17:10).
  - Tối: PA1 (17:30 - 20:00) | PA2 (18:00 - 20:30).`,
    },
    {
        id: "GT-03",
        topic: "GIOI_THIEU",
        title: "Hệ thống thông tin sinh viên & Quy định sử dụng Email OU",
        keywords: [
            "hệ thống thông tin", "sis", "lms", "elearning", "tienichsv", "email sinh viên",
            "mail trường", "mật khẩu", "đăng nhập", "cổng thông tin", "thư quán", "ebook",
            "tuyển dụng", "việc làm", "cvht", "cố vấn học tập",
        ],
        summary: "Sinh viên dùng MSSV đăng nhập sis.ou.edu.vn, tienichsv.ou.edu.vn, lms.ou.edu.vn và email dạng [MSSV+Tên]@ou.edu.vn (bắt buộc kiểm tra hằng ngày).",
        content: `1. Các cổng thông tin cần nhớ (đăng nhập bằng MSSV):
• Trang chủ & Quản lý đào tạo: https://ou.edu.vn | http://ou.edu.vn/qldt
• Đăng ký môn học, TKB, học phí: https://tienichsv.ou.edu.vn
• Dịch vụ sinh viên (điểm, lịch thi, ngoại trú): http://sis.ou.edu.vn
• Học tập trực tuyến (LMS chính quy): http://lms.ou.edu.vn | http://learn.ou.edu.vn (Từ xa/VLVH: lms.oude.edu.vn)
• Điểm rèn luyện online: http://diemrl.ou.edu.vn | Cố vấn học tập: http://cvht.ou.edu.vn
• Đặt sách / Ebook (Thư quán): http://thuquan.ou.edu.vn (sách in: sachin.ou.edu.vn; gói Ebook 1 năm 200.000đ, 4 năm 400.000đ)
• Việc làm & Nhà trọ: http://vieclam.ou.edu.vn | http://nhatro.ou.edu.vn

2. Email sinh viên (QĐ 1461/QĐ-ĐHM):
• Định dạng chính quy: [MSSV + Tên]@ou.edu.vn (Từ xa/VLVH: @oude.edu.vn) trên nền tảng Google Apps.
• Bắt buộc dùng email trường khi liên hệ đơn vị/giảng viên và kiểm tra ít nhất 1 lần/ngày.
• Giao dịch văn bản điện tử hợp lệ được cộng 05 điểm rèn luyện vào Điều 4.
• Mất quyền truy cập / quên mật khẩu liên hệ Trung tâm QLHTTT (P.101 - 35-37 Hồ Hảo Hớn | hotro@ou.edu.vn | (028) 39207621).`,
    },
    {
        id: "HV-01",
        topic: "HOC_VU",
        title: "Thang điểm, xếp loại học lực & phúc tra điểm (QĐ 2266/QĐ-ĐHM)",
        keywords: [
            "thang điểm", "gpa", "cpa", "điểm chữ", "điểm hệ 4", "tính điểm", "điểm trung bình",
            "xếp loại học lực", "a+", "điểm a", "điểm f", "điểm d", "điểm p", "điểm i",
            "phúc tra", "khiếu nại điểm", "xem lại bài thi",
        ],
        summary: "OU áp dụng thang 10 quy đổi sang điểm chữ (A+ và A đều 4.0) và thang 4. Điểm quá trình tối thiểu 50% hoặc theo đề cương; phúc tra cuối kỳ nộp tại P. Thanh tra - Pháp chế.",
        content: `1. Bảng quy đổi thang điểm 10 – Điểm chữ – Thang điểm 4 (Điều 16 & Điều 21 QĐ 2266/QĐ-ĐHM):
• 9,0 – 10: A+ (4,0) | 8,5 – 8,9: A (4,0)
• 8,0 – 8,4: B+ (3,5) | 7,0 – 7,9: B (3,0)
• 6,5 – 6,9: C+ (2,5) | 5,5 – 6,4: C (2,0)
• 5,0 – 5,4: D+ (1,5) | 4,0 – 4,9: D (1,0)
• Dưới 4,0: F (0,0 - Không đạt).
• Môn đạt không phân mức: P (từ 5,0 trở lên, không tính vào điểm TB).
• Ký hiệu khác: I (chưa hoàn thiện do được phép hoãn thi), X (chưa đủ dữ liệu), R (được miễn & công nhận tín chỉ), D (Đạt), K (Không đạt).

2. Xếp loại học lực (theo ĐTB học kỳ, năm học hoặc tích lũy):
• Xuất sắc: 3,60 – 4,00 | Giỏi: 3,20 – 3,59 | Khá: 2,50 – 3,19 | Trung bình: 2,00 – 2,49.
• Không đạt: Yếu (1,00 – 1,99) | Kém (dưới 1,00).
• Lưu ý: GDQP&AN, GDTC và Tiếng Anh căn bản 1–5 không tính vào ĐTB tích lũy và số TC tích lũy.

3. Phúc tra & khiếu nại điểm (Điều 23):
• Điểm quá trình: khiếu nại trực tiếp với giảng viên khi công bố trên lớp/LMS (trước khi nộp bảng điểm về P. Khảo thí).
• Sai lệch điểm hệ thống vs bảng điểm công bố: báo Phòng Khảo thí (P.501 - 35-37 HHH | pkt@ou.edu.vn).
• Điểm thi cuối kỳ: nộp đơn xem lại kết quả chấm thi tại Phòng Thanh tra – Pháp chế (P.701 - 35-37 HHH | ttdt@ou.edu.vn).`,
    },
    {
        id: "HV-02",
        topic: "HOC_VU",
        title: "Cảnh báo học tập, nghỉ học tạm thời & buộc thôi học",
        keywords: [
            "cảnh báo học vụ", "cảnh báo học tập", "bị cảnh báo", "buộc thôi học", "đuổi học",
            "nghỉ học tạm thời", "bảo lưu", "tạm dừng học", "thôi học", "thời gian tối đa", "rớt môn",
        ],
        summary: "Cảnh báo học tập khi GPA < 0,8 (HK đầu), < 1,0 (HK sau) hoặc tự ý nghỉ học. Cảnh báo 02 lần liên tiếp hoặc hết thời gian tối đa (gấp đôi kế hoạch chuẩn) sẽ bị buộc thôi học.",
        content: `1. Cảnh báo học tập (Điều 24 QĐ 2266/QĐ-ĐHM):
• Điểm trung bình học kỳ đạt dưới 0,8 ở học kỳ đầu của khóa học; hoặc dưới 1,0 ở các học kỳ tiếp theo.
• Hoặc tự ý nghỉ học (không đăng ký môn học).

2. Nghỉ học tạm thời & Bảo lưu (Điều 27):
• Được xin nghỉ học tạm thời khi: nhập ngũ, thi đấu/thi quốc tế, ốm/thai sản/tai nạn điều trị dài ngày (có giấy y tế), hoặc lý do cá nhân (đã học tối thiểu 01 HK và không thuộc diện buộc thôi học/kỷ luật).
• Phải nộp đơn trước khi kết thúc đăng ký môn bình thường ít nhất 01 tuần; khi học lại phải làm thủ tục trước HK mới ít nhất 01 tuần (tính vào thời gian tối đa toàn khóa).

3. Buộc nghỉ học tạm thời & Buộc thôi học (Điều 28):
• Buộc nghỉ học tạm thời: tự ý bỏ học không lý do, không hoàn thành nghĩa vụ học phí trong kỳ, hoặc kỷ luật đến mức buộc nghỉ tạm thời.
• Buộc thôi học: (a) Bị cảnh báo học tập 02 lần liên tiếp; (b) Hết thời gian đào tạo tối đa (02 lần thời gian kế hoạch chuẩn toàn khóa) nhưng chưa đủ điều kiện tốt nghiệp; (c) Vi phạm kỷ luật đến mức buộc thôi học (như thi hộ lần 2, hồ sơ giả).`,
    },
    {
        id: "HV-03",
        topic: "HOC_VU",
        title: "Miễn, giảm môn học & chuyển đổi tín chỉ (QĐ 2267/QĐ-ĐHM)",
        keywords: [
            "miễn môn", "giảm môn", "chuyển đổi tín chỉ", "miễn gdtc", "miễn thể dục",
            "miễn quốc phòng", "hoãn quốc phòng", "gdqp", "gdtc",
        ],
        summary: "Tổng số tín chỉ xét miễn tối đa 50% CTĐT (điểm môn >= 5,0). Nộp hồ sơ tại P.QLĐT trong vòng 1 tháng kể từ khi nhập học (chỉ xét 1 lần cho toàn khóa).",
        content: `1. Điều kiện chung xét miễn, giảm (Điều 4 QĐ 2267/QĐ-ĐHM):
• Tổng số tín chỉ được xét miễn không vượt quá 50% tổng số tín chỉ tối thiểu của CTĐT.
• Điểm môn học xét miễn đạt từ 5,0 trở lên (thang 10), số TC >= số TC môn học tại Trường.
• Khối kiến thức đại cương: không giới hạn thời gian; khối chuyên nghiệp: không quá 7 năm.

2. Miễn/giảm GDTC & GDQP&AN:
• GDTC: miễn nếu có chứng chỉ/bảng điểm GDTC tương đương trở lên; giảm thực hành nếu có thương tật/bệnh lý (có xác nhận bệnh viện cấp quận/huyện trở lên và đồng ý của Trạm Y tế Trường).
• GDQP&AN: miễn học nếu có giấy chứng nhận sĩ quan dự bị, bằng tốt nghiệp trường quân đội/công an, chứng chỉ GDQP&AN ĐH/CĐSP, hoặc là người nước ngoài; miễn thực hành nếu khuyết tật, không đủ sức khỏe (Trạm Y tế xác nhận), hoặc đã hoàn thành nghĩa vụ quân sự/CAND; tạm hoãn nếu điều trị dài ngày hoặc mang thai/thai sản.

3. Thủ tục & Thời hạn:
• Nộp đơn + bảng điểm/chứng chỉ tại Phòng Quản lý đào tạo (P.005 - 97 VVT) trong vòng 01 tháng kể từ khi làm thủ tục nhập học (chỉ xét 1 lần toàn khóa, trả kết quả tối đa 30 ngày).`,
    },
    {
        id: "HV-04",
        topic: "HOC_VU",
        title: "Chuyển trường, chuyển ngành, chuyển CLC & học song bằng (2 chương trình)",
        keywords: [
            "chuyển trường", "chuyển ngành", "chuyển chương trình", "chất lượng cao", "clc",
            "đại trà", "học hai chương trình", "song bằng", "song ngành", "hai văn bằng", "liên thông",
        ],
        summary: "Chỉ chuyển ngành/trường/CLC khi không ở năm 1 hoặc năm cuối (chuyển ngành & CLC chỉ xét 1 lần toàn khóa). Học 2 chương trình từ năm 2 nếu đủ điều kiện học lực.",
        content: `1. Chuyển trường / Chuyển ngành / Chuyển vào-ra Chất lượng cao (Điều 29-30 QĐ 2266 & QĐ 2126/QĐ-ĐHM):
• Không phải sinh viên trình độ năm 1 hoặc năm cuối khóa, không thuộc diện buộc thôi học và còn đủ thời gian học tập tối đa.
• Điểm xét tuyển >= điểm trúng tuyển cùng tổ hợp/đợt của ngành/chương trình chuyển đến.
• Chỉ được xét chuyển ngành hoặc chuyển chương trình (Đại trà <-> CLC) 01 lần duy nhất trong suốt khóa học.
• Ngành đang học dưới 60 SV (Đại trà) hoặc dưới 30 SV (CLC) không được giải quyết chuyển đi.

2. Học cùng lúc hai chương trình (Điều 33 QĐ 2266):
• Đăng ký sớm nhất khi đã xếp trình độ năm thứ hai ở chương trình 1.
• Điều kiện: ĐTB tích lũy từ Khá trở lên (hoặc Trung bình và đạt điểm trúng tuyển CT2 cùng năm tuyển sinh).
• Nếu ĐTB tích lũy CT1 xuống dưới Trung bình hoặc bị cảnh báo học tập thì phải dừng CT2 ở kỳ tiếp theo.
• Chỉ được xét tốt nghiệp CT2 khi đã đủ điều kiện tốt nghiệp CT1 và đăng ký muộn nhất 02 năm trước khi xét tốt nghiệp CT2. Nộp đơn tại P.QLĐT đầu học kỳ.`,
    },
    {
        id: "DKM-01",
        topic: "DANG_KY_MON",
        title: "Quy định đăng ký môn học, rút môn, học vượt & học cải thiện",
        keywords: [
            "đăng ký học phần", "đăng ký môn", "rút môn", "hủy môn", "đăng ký trễ hạn",
            "học vượt", "học cải thiện", "học lại", "tín chỉ tối thiểu", "tín chỉ tối đa",
            "khóa mã số sinh viên", "mở lớp theo yêu cầu",
        ],
        summary: "Đại trà đăng ký 8-20 TC/HK, CLC 9-23 TC/HK qua tienichsv.ou.edu.vn. Điều chỉnh/rút môn trong 2 tuần đầu học kỳ; học cải thiện áp dụng với môn đạt điểm < 9.",
        content: `1. Khối lượng tín chỉ đăng ký mỗi học kỳ (QĐ 1644/QĐ-ĐHM):
• Chương trình Đại trà: Tối thiểu 8 tín chỉ – Tối đa 20 tín chỉ.
• Chương trình Chất lượng cao: Tối thiểu 9 tín chỉ – Tối đa 23 tín chỉ.
• (Không tính GDQP&AN, GDTC và Tiếng Anh căn bản; theo QĐ 2266: từ 2/3 đến 3/2 khối lượng TB chuẩn).
• Lưu ý: SV chính khóa ngành không chuyên ngữ phải đăng ký 02 cấp độ tiếng Anh tiếp theo của học kỳ liền trước mới được đăng ký các môn còn lại.

2. Thời gian & Hình thức đăng ký:
• Đăng ký trực tuyến trên https://tienichsv.ou.edu.vn trước khi bắt đầu học kỳ tối thiểu 01 tháng (4 tuần).
• Đăng ký trễ hạn / điều chỉnh khối lượng: trong 02 tuần đầu học kỳ tại Phòng QLĐT. Ngoài thời hạn này, không học vẫn phải đóng học phí và nhận điểm 0.
• Mở lớp học lại theo yêu cầu: sĩ số tối thiểu 40 sinh viên (ít hơn phải có phê duyệt của Hiệu trưởng).

3. Học vượt, học lại & học cải thiện:
• Học vượt môn cơ sở ngành/ngành/chuyên ngành: làm đơn có Cố vấn học tập duyệt gửi P.QLĐT.
• Học cải thiện: áp dụng cho môn đã đạt nhưng điểm < 9; công nhận điểm cao nhất trong các lần thi.
• Không đóng học phí / đóng trễ hạn sẽ bị khóa MSSV ở kỳ kế tiếp (làm thủ tục mở lại tại P.QLĐT).`,
    },
    {
        id: "DKM-02",
        topic: "DANG_KY_MON",
        title: "Quy định điều chỉnh lịch thi & hoãn thi (QĐ 2270/QĐ-ĐHM)",
        keywords: [
            "điều chỉnh lịch thi", "hoãn thi", "trùng lịch thi", "vắng thi", "kỳ thi phụ",
            "ốm đau khi thi", "đổi lịch thi",
        ],
        summary: "SV được điều chỉnh lịch thi khi ốm đau (giấy y tế quận/huyện+), công tác đột xuất, cưới, tang thân nhân, hoặc trùng lịch thi. Nộp hồ sơ tại P.QLĐT trong 3 ngày hoặc 1 tuần.",
        content: `1. Các trường hợp được xét điều chỉnh lịch thi (Điều 3 QĐ 2270/QĐ-ĐHM):
• Ốm đau, bệnh tật (có giấy xác nhận cơ sở y tế cấp quận/huyện trở lên hoặc Giấy xuất viện nếu điều trị nội trú).
• Đi công tác đột xuất (có quyết định cử đi công tác của cơ quan).
• Tổ chức lễ cưới trùng lịch thi (có Giấy đăng ký kết hôn và thiệp cưới).
• Có tang thân nhân: vợ/chồng, ông/bà, cha/mẹ, anh/chị/em ruột (bản sao trích lục khai tử + giấy xác nhận quan hệ).
• Bị xếp trùng lịch thi.

2. Thời hạn & Thủ tục:
• Nộp Phiếu đề nghị + minh chứng tại Bộ phận tiếp sinh viên - Phòng QLĐT (tải mẫu tại https://quanlydaotao.ou.edu.vn/cac-mau-bieu-cua-phong-qldt).
• Thời hạn nộp: trễ nhất 03 ngày theo lịch thi đã công bố (ốm, công tác, cưới, tang); hoặc trong 01 tuần kể từ ngày thông báo lịch thi (trường hợp trùng lịch thi).
• P.QLĐT trả lời qua email trường tối đa sau 03 ngày làm việc. Nếu vắng thi không phép sẽ nhận điểm 0 môn học.`,
    },
    {
        id: "TN-01",
        topic: "CHUAN_DAU_RA",
        title: "Thực tập, Khóa luận & Điều kiện công nhận Tốt nghiệp",
        keywords: [
            "tốt nghiệp", "điều kiện tốt nghiệp", "xét tốt nghiệp", "hạng tốt nghiệp", "hạ bậc",
            "thực tập tốt nghiệp", "khóa luận", "đồ án tốt nghiệp", "bảo vệ khóa luận", "cấp bằng",
        ],
        summary: "Trường xét tốt nghiệp 3 đợt/năm. Điều kiện: tích lũy đủ tín chỉ, GPA >= 2.0, đạt chuẩn đầu ra NN & TH, không bị truy cứu hình sự hay đang đình chỉ.",
        content: `1. Thực tập & Đồ án/Khóa luận tốt nghiệp (Điều 19-20 QĐ 2266/QĐ-ĐHM):
• Thực tập tốt nghiệp: bắt buộc 4–6 tín chỉ, thời gian 8–12 tuần (nộp nhật ký & báo cáo có xác nhận đơn vị).
• Đồ án/Khóa luận tốt nghiệp: tối đa 12 tín chỉ, thực hiện 10–17 tuần; đánh giá gồm 25% điểm quá trình + 75% điểm Hội đồng.

2. Điều kiện xét công nhận tốt nghiệp (Điều 26):
• Tích lũy đủ môn học, số tín chỉ và đạt chuẩn đầu ra (Ngoại ngữ, Tin học, GDTC, GDQP&AN).
• ĐTB tích lũy toàn khóa đạt từ Trung bình (2,00) trở lên.
• Không đang bị truy cứu trách nhiệm hình sự hoặc không trong thời gian bị kỷ luật đình chỉ học tập.
• Nộp đơn đề nghị xét tốt nghiệp gửi P.QLĐT nếu tốt nghiệp sớm/muộn hơn kế hoạch chuẩn.
• Xét tốt nghiệp 3 lần/năm; cấp bằng trong vòng 30 ngày kể từ ngày có quyết định công nhận.

3. Lưu ý hạ hạng tốt nghiệp & gia hạn chuẩn đầu ra:
• Hạng Xuất sắc/Giỏi bị hạ 1 bậc nếu học lại > 5% tổng số TC toàn chương trình hoặc từng bị kỷ luật từ mức Cảnh cáo trở lên.
• Nếu hết thời gian tối đa mà chỉ còn thiếu GDQP&AN, GDTC hoặc chuẩn đầu ra NN/CNTT: được hoàn thiện và đề nghị xét tốt nghiệp trong thời hạn 03 năm tính từ khi thôi học.`,
    },
    {
        id: "TN-02",
        topic: "CHUAN_DAU_RA",
        title: "Quy định Ngoại ngữ không chuyên & Chuẩn đầu ra Tiếng Anh (QĐ 2271)",
        keywords: [
            "tiếng anh", "ngoại ngữ", "chuẩn đầu ra", "bậc 3/6", "bậc 4/6", "dự bị tiếng anh",
            "ngoại ngữ hai", "miễn tiếng anh", "jlpt", "topik", "hsk", "delf", "goethe", "thi đầu ra",
        ],
        summary: "Đầu vào tiếng Anh bậc 2/6 (không đạt học Dự bị 5 cấp độ). Đầu ra: bậc 3/6 (chương trình chuẩn, điểm thi 4.0-5.5) và bậc 4/6 (CLC, điểm thi 6.0-10).",
        content: `1. Tiếng Anh đầu vào & Chương trình Dự bị (Điều 3-4 QĐ 2271/QĐ-ĐHM):
• Chuẩn đầu vào: bậc 2/6 (Khung NLNN 6 bậc VN). SV không đạt sẽ học Tiếng Anh dự bị (15 TC, 5 cấp độ Căn bản 1–5 trực tuyến, thi trực tiếp) và phải đạt Căn bản 5 >= 5,0 mới được học Tiếng Anh CTĐT.
• Mỗi HK đăng ký tối thiểu 6 TC tiếng Anh theo lộ trình cá nhân.

2. Chuẩn đầu ra Tiếng Anh (Điều 5 & Điều 8):
• Chương trình chuẩn: 5 cấp độ (Tiếng Anh nâng cao 1–5, 3 TC/cấp), đạt Nâng cao 5 >= 5,0 và đạt kỳ thi đánh giá năng lực đầu ra mức 4,0 – 5,5 (tương đương bậc 3/6).
• Chương trình Chất lượng cao: 10 cấp độ (Nâng cao 1–10), đạt Nâng cao 10 >= 5,0 và đạt kỳ thi đầu ra mức 6,0 – 10 (tương đương bậc 4/6).
• Kỳ thi đánh giá năng lực tiếng Anh đầu ra tổ chức 3 lần/năm (4 kỹ năng Nghe-Đọc-Viết-Nói; vắng >= 1 bài thi tính không đạt).

3. Ngoại ngữ hai & Xét miễn (Điều 6 & Điều 9):
• Ngoại ngữ hai: 15 TC (5 cấp độ), đạt >= 5,0/môn, chuẩn đầu ra bậc 3/6 (với ngành Ngôn ngữ & ĐNÁ học).
• Xét miễn Ngoại ngữ hai khi có: DELF B1 (Pháp), JLPT N4 / NAT-TEST 4 (Nhật), TOPIK II cấp 3 (Hàn), DELE B1 (TBN), HSK 3 / TOCFL 970 (Trung), TRKI-1 (Nga), Goethe B1 (Đức). Nộp hồ sơ tại P.QLĐT.`,
    },
    {
        id: "TN-03",
        topic: "CHUAN_DAU_RA",
        title: "Quy định Tin học nâng cao (QĐ 2268) & Giáo dục Quốc phòng - An ninh (QĐ 2269)",
        keywords: [
            "tin học", "tin học văn phòng", "mos", "icdl", "miễn tin học", "chuẩn đầu ra tin học",
            "quốc phòng", "gdqp", "quân sự", "long bình tân", "chứng chỉ quốc phòng",
        ],
        summary: "Tin học văn phòng nâng cao yêu cầu đạt >= 5,0 (miễn với bằng CNTT, MOS Word+Excel+PPT, ICDL 3 module). GDQP&AN học tại Cơ sở Long Bình Tân (đạt ĐTBCTL >= 2,0).",
        content: `1. Tin học văn phòng nâng cao (QĐ 2268/QĐ-ĐHM):
• Không áp dụng cho các ngành: CNTT, Khoa học máy tính, HTTT quản lý, Khoa học dữ liệu, Trí tuệ nhân tạo.
• Đầu vào: Tin học cơ bản (TT 03/2014). Đầu ra: đạt điểm >= 5,0 (thang 10) môn Tin học văn phòng nâng cao.
• Được xét miễn nếu nộp bản sao tại P.QLĐT trong vòng 01 tháng kể từ khi nhập học một trong các giấy tờ:
  - Bằng tốt nghiệp (trung cấp trở lên) ngành CNTT;
  - Chứng chỉ Ứng dụng CNTT nâng cao hợp lệ;
  - Chứng chỉ MOS (đủ Word, Excel, PowerPoint);
  - Chứng chỉ ICDL (3 module nâng cao: Word, Spreadsheet, Presentation).

2. Giáo dục Quốc phòng và An ninh (QĐ 2269/QĐ-ĐHM):
• Học phần bắt buộc, tổ chức giảng dạy tại Cơ sở 2 (Đường số 9, P. Long Bình Tân, TP. Biên Hòa, Đồng Nai).
• Lớp lý thuyết <= 150 SV, thực hành <= 40 SV; điểm không tính vào ĐTB tích lũy toàn khóa.
• Điều kiện cấp chứng chỉ: ĐTBCTL của 4 môn GDQP&AN đạt từ 2,0 trở lên (có 01 kỳ thi phụ ngay sau kỳ thi chính nếu chưa đạt).`,
    },
    {
        id: "HB-01",
        topic: "HOC_BONG_HOC_PHI",
        title: "Học bổng, Miễn giảm học phí & Vay vốn sinh viên",
        keywords: [
            "học bổng", "miễn giảm học phí", "chế độ chính sách", "vay vốn", "ngân hàng chính sách",
            "sổ ưu đãi", "tân sinh viên", "tài năng", "vượt khó", "tiếp sức", "khuyến khích học tập",
        ],
        summary: "Trường có hơn 5.000 suất học bổng/năm và hỗ trợ bù chênh lệch học phí cho đối tượng chính sách theo NĐ 81/2021 & NĐ 97/2023. Thủ tục xác nhận tại P. CTSV&TT.",
        content: `1. Các loại Học bổng tại OU (> 5.000 suất/năm):
• Học bổng khuyến khích học tập dành cho tân sinh viên; Học bổng Tuyển sinh.
• Học bổng Tài năng; Học bổng Khuyến khích học tập; Học bổng Vượt khó học tập.
• Học bổng Tiếp sức đến Trường; Học bổng Khuyến khích nâng cao năng lực tiếng Anh.
• Học bổng Sinh viên 5 tốt; Học bổng Thanh niên tiên tiến làm theo lời Bác.
• Chi tiết điều kiện từng đợt xem tại: https://ou.edu.vn (mục Sinh viên -> Học bổng).

2. Miễn, giảm học phí & Hỗ trợ tài chính:
• Sinh viên diện chính sách được miễn/giảm 100%, 70%, 50% học phí theo NĐ 81/2021/NĐ-CP và NĐ 97/2023/NĐ-CP; Trường hỗ trợ toàn bộ phần chênh lệch học phí (từ khóa 2015 trở đi).
• Nộp hồ sơ đầu khóa học (riêng dân tộc thiểu số hộ nghèo nộp bổ sung xác nhận hộ nghèo vào tháng 01 hằng năm).
• Xác nhận vay vốn Ngân hàng Chính sách xã hội / Sổ ưu đãi giáo dục: liên hệ Phòng Công tác Sinh viên và Truyền thông (P.003 - 97 VVT), thời gian giải quyết 3 – 5 ngày.`,
    },
    {
        id: "HB-02",
        topic: "HOC_BONG_HOC_PHI",
        title: "Đóng học phí, hoàn trả học phí & mở khóa mã số sinh viên",
        keywords: [
            "học phí", "đóng học phí", "nộp học phí", "hoàn học phí", "trả học phí", "biên lai",
            "nợ học phí", "khóa mã số", "mở mã số", "tài chính kế toán",
        ],
        summary: "Đóng học phí trực tuyến hoặc tại ngân hàng liên kết. Nợ/trễ học phí bị khóa MSSV. Hoàn học phí cần xác nhận P.QLĐT (P.005) rồi nhận tại P.TC-KT.",
        content: `1. Đóng học phí & Khóa mã số sinh viên:
• SV xem số tiền học phí tại https://tienichsv.ou.edu.vn và đóng trực tuyến hoặc tại các ngân hàng liên kết theo hướng dẫn của Phòng Tài chính – Kế toán.
• SV không đóng hoặc đóng trễ hạn sẽ bị khóa mã số sinh viên ở học kỳ kế tiếp (và xem xét buộc nghỉ học tạm thời nếu không hoàn thành nghĩa vụ học phí trong kỳ).
• Thủ tục mở khóa mã số sinh viên: liên hệ Phòng Quản lý đào tạo (nộp phí dịch vụ theo quy định tại P.TC-KT).

2. Thủ tục hoàn trả học phí:
• Bước 1: Sinh viên chính quy liên hệ Phòng Quản lý đào tạo (P.005 - 97 Võ Văn Tần) để lấy Phiếu hoàn học phí.
• Bước 2: Mang hồ sơ đến Phòng Tài chính – Kế toán (P.601 - 35-37 HHH hoặc quầy P.009 - 97 VVT) gồm:
  - Phiếu hoàn học phí;
  - Thẻ sinh viên hoặc CMND/CCCD;
  - Bản chính + 01 bản photo biên lai đóng học phí có môn học được hoàn.
• Đổi biên lai ngân hàng / xác nhận mất biên lai: liên hệ Phòng Tài chính – Kế toán.`,
    },
    {
        id: "DRL-01",
        topic: "DIEM_REN_LUYEN",
        title: "Đánh giá Điểm rèn luyện online & Khen thưởng sinh viên",
        keywords: [
            "điểm rèn luyện", "drl", "diemrl", "rèn luyện", "khen thưởng", "sinh viên xuất sắc",
            "sinh viên giỏi", "ban cán sự", "lớp tiên tiến", "cộng điểm", "khóa mssv",
        ],
        summary: "SV đánh giá ĐRL online tại diemrl.ou.edu.vn. Xếp loại yếu/kém 2 HK liên tiếp (< 50 điểm) bị khóa MSSV. ĐRL dùng xét học bổng và ghi vào bảng điểm tốt nghiệp.",
        content: `1. Quy định Đánh giá Kết quả Rèn luyện (ĐRL) online:
• Bắt buộc thực hiện mỗi học kỳ tại website: http://diemrl.ou.edu.vn.
• Điểm rèn luyện dùng để xét học bổng KKHT mỗi học kỳ và được ghi vào bảng điểm tốt nghiệp.
• Sinh viên bị xếp loại rèn luyện Yếu, Kém (dưới 50 điểm) 02 học kỳ liên tiếp sẽ bị khóa mã số sinh viên ở học kỳ tiếp theo.
• Giao dịch văn bản điện tử hợp lệ qua hệ thống trường được cộng 05 ĐRL vào Điều 4.
• Ban cán sự lớp sinh viên / lớp học phần được ưu tiên cộng ĐRL.

2. Danh hiệu Khen thưởng cá nhân & tập thể (Điều 7 QĐ 2170/QĐ-ĐHM):
• Cá nhân cuối năm/khóa: Xuất sắc (GPA >= 3,6 và ĐRL Xuất sắc), Giỏi (học tập Giỏi+ và ĐRL Tốt+), Khá (học tập & ĐRL từ Khá+). Không xét khen thưởng nếu bị kỷ luật hoặc có môn dưới trung bình trong năm.
• Cuối khóa: SV toàn khóa loại Giỏi+, bảo vệ khóa luận 10 điểm hoặc thủ khoa toàn khóa được Hiệu trưởng cấp giấy khen & tiền thưởng.
• Tập thể: Lớp Tiên tiến (>= 25% SV Khá+, có SV Giỏi+, không có Kém/kỷ luật) và Lớp Xuất sắc (đạt Tiên tiến + >= 10% Giỏi+ và có SV Xuất sắc).`,
    },
    {
        id: "DRL-02",
        topic: "DIEM_REN_LUYEN",
        title: "Đăng ký ngoại trú, hoạt động bắt buộc, CLB, Nhà trọ & NCKH",
        keywords: [
            "ngoại trú", "đăng ký ngoại trú", "trừ 5 điểm", "hoạt động bắt buộc", "câu lạc bộ",
            "clb", "nhà trọ", "nckh", "nghiên cứu khoa học", "công bố quốc tế", "sinh hoạt công dân",
        ],
        summary: "Bắt buộc khai báo ngoại trú trên sis.ou.edu.vn (không khai báo trừ 05 ĐRL/HK). Trường hỗ trợ nhà trọ (nhatro.ou.edu.vn) và thưởng NCKH lên đến 100 triệu đồng bài Q1.",
        content: `1. Đăng ký ngoại trú (Bắt buộc):
• Khai báo tại http://sis.ou.edu.vn -> Danh sách dịch vụ/tiện ích -> [Đăng ký ngoại trú] vào đầu khóa, đầu mỗi học kỳ và trong vòng 20 ngày nếu đổi chỗ ở.
• Không khai báo thông tin ngoại trú bị trừ 05 điểm rèn luyện/học kỳ.

2. Các hoạt động bắt buộc của sinh viên:
• Tuần lễ Sinh hoạt công dân; đăng ký kế hoạch ngoại khóa & đánh giá ĐRL online;
• Phản hồi môn học và giảng viên; tham gia hoạt động tình nguyện, sinh hoạt lớp/chi Đoàn;
• Đoàn viên: đăng ký & đánh giá rèn luyện Đoàn viên, học 6 bài lý luận chính trị;
• Sinh viên năm cuối: tham gia Ngày hội nghề nghiệp (http://vieclam.ou.edu.vn).

3. Dịch vụ Nhà trọ, CLB & Nghiên cứu khoa học (NCKH):
• Nhà trọ liên kết: xem tại http://nhatro.ou.edu.vn hoặc P. CTSV&TT.
• CLB - Đội - Nhóm: khuyến khích mỗi SV tham gia ít nhất 01 CLB (tuyển thành viên đầu năm/đầu kỳ).
• NCKH: cuộc thi SV NCKH cấp Trường nhận đề cương khoảng tháng 3–5 hằng năm (https://htqlkh.ou.edu.vn). Công bố quốc tế Q1 (SCIE/SSCI/AHCI) có ghi đúng tên Trường được thưởng cao nhất đến 100 triệu đồng/bài.`,
    },
    {
        id: "DRL-03",
        topic: "DIEM_REN_LUYEN",
        title: "Văn hóa ứng xử, Nội quy & Khung xử lý Kỷ luật sinh viên",
        keywords: [
            "văn hóa ứng xử", "nội quy", "trang phục", "thẻ sinh viên", "dép lê", "kỷ luật",
            "khiển trách", "cảnh cáo", "đình chỉ", "thi hộ", "vi phạm", "giờ giới nghiêm", "an ninh",
        ],
        summary: "SV đến trường phải đeo thẻ SV, đi giày/dép có quai hậu, trang phục lịch sự. Kỷ luật gồm Khiển trách (hết hiệu lực sau 3 tháng), Cảnh cáo (6 tháng), Đình chỉ, Buộc thôi học.",
        content: `1. Quy định Văn hóa ứng xử & Trang phục (QĐ 1035/QĐ-ĐHM):
• Bắt buộc đeo Thẻ sinh viên/học viên khi đến Trường; đi giày hoặc dép có quai hậu (không mang dép lê).
• Trang phục lịch sự: Nam mặc áo sơ mi/thun có tay, quần dài; Nữ không mặc đồ quá chật/mỏng, váy ngắn trên đầu gối, áo sát nách/áo dây.
• Lớp học: đúng giờ, không dùng điện thoại, không ăn quà vặt, không nói chuyện riêng, tháo khăn che mặt & xuống xe dẫn bộ qua cổng.
• Giờ giới nghiêm: không đi lại trong khuôn viên Trường từ 23:00 hôm trước đến 05:00 sáng hôm sau.

2. Các hình thức Kỷ luật sinh viên (QĐ 2170/QĐ-ĐHM & QĐ 2710/QĐ-ĐHM):
• Khiển trách (hết hiệu lực sau 03 tháng nếu không tái phạm).
• Cảnh cáo (hết hiệu lực sau 06 tháng nếu không tái phạm; trong thời gian bị khiển trách/cảnh cáo không được hưởng học bổng, thi Olympic/giao lưu quốc tế).
• Đình chỉ học tập có thời hạn (1 HK, 1 năm, hoặc theo án treo): áp dụng với lỗi nghiêm trọng; thi hộ / nhờ thi hộ lần 1 bị đình chỉ 01 năm.
• Buộc thôi học: thi hộ / nhờ thi hộ lần 2, dùng hồ sơ/văn bằng giả, án tù giam, hoặc tái phạm khi đang bị đình chỉ.
• Gian lận trên mạng xã hội / bôi nhọ uy tín Trường & cá nhân có thể chuyển cơ quan chức năng xử lý.`,
    },
    {
        id: "PB-01",
        topic: "PHONG_BAN",
        title: "Danh bạ các Phòng ban, Thư viện & Trung tâm hỗ trợ SV",
        keywords: [
            "phòng ban", "liên hệ", "phòng đào tạo", "quản lý đào tạo", "qldt", "công tác sinh viên",
            "ctsv", "osa", "tài chính kế toán", "khảo thí", "thư viện", "trạm y tế", "bhyt",
            "đoàn thanh niên", "hội sinh viên", "thanh tra", "hợp tác khoa học", "học liệu", "thư quán",
            "hotline", "email phòng", "giờ làm việc",
        ],
        summary: "Thông tin chính thức Phòng QLĐT (P.005 VVT), Phòng CTSV&TT (P.003 VVT - osa@ou.edu.vn), Phòng TC-KT (P.601 HHH), Phòng Khảo thí (P.501 HHH), Trạm Y tế, Thư viện, Đoàn-Hội.",
        content: `1. Phòng Quản lý Đào tạo (QLĐT):
• Địa chỉ: P.005 - 97 Võ Văn Tần, Q.3 | P.001 - 35-37 Hồ Hảo Hớn, Q.1.
• Giờ tiếp SV: 8:00-11:30 & 13:00-16:30 (Thứ 2 - Thứ 6) tại P.005.
• ĐT: (028) 39300072 - (028) 39207626 | Email: quanlydaotao@ou.edu.vn | Web: www.ou.edu.vn/qldt.

2. Phòng Công tác Sinh viên và Truyền thông (CTSV&TT):
• Địa chỉ: P.003, 008 - 97 Võ Văn Tần, Q.3 (Tiếp SV: 8:00-12:00 & 13:00-17:00 T2-T6 tại P.003).
• ĐT: (028) 39302146 - (028) 39300077 | Hotline: (028) 39330660 | Email: osa@ou.edu.vn | Web: www.ou.edu.vn/osa.

3. Phòng Tài chính – Kế toán & Phòng Khảo thí:
• Phòng TC-KT: P.601 - 35-37 Hồ Hảo Hớn, Q.1 (Quầy giao dịch: P.009 - 97 VVT) | ĐT: (028) 39207632 | Email: ptckt@ou.edu.vn.
• Phòng Khảo thí: P.501 - 35-37 Hồ Hảo Hớn, Q.1 | ĐT: (028) 39207629 | Email: pkt@ou.edu.vn | Web: http://www.ou.edu.vn/ttkt.

4. Các đơn vị hỗ trợ khác:
• Trạm Y tế (BHYT/BHTN): P.104 - 97 VVT | ĐT: (028) 39301374 | tramytesv@ou.edu.vn.
• Thư viện chính: P.504 lầu 5 - 97 VVT | ĐT: (028) 39300209 | thuviendhm@ou.edu.vn | https://thuvien.ou.edu.vn.
• Đoàn Thanh niên – Hội SV: P.101 & 103A - 97 VVT | ĐT: (028) 39300154 | canbovanphongdoanhoi@ou.edu.vn.
• TT Quản lý hệ thống thông tin (hỗ trợ mail/mạng/LMS): P.101 - 35-37 HHH | (028) 39207621 | hotro@ou.edu.vn.
• Phòng Thanh tra – Pháp chế (xem lại bài thi/khiếu nại): P.701 - 35-37 HHH | (028) 39207634 | ttdt@ou.edu.vn.
• Phòng Hợp tác & QLKH: P.201 - 35-37 HHH | (028) 39207622 | phonghtqlkh@ou.edu.vn.
• TT Học liệu & Thư quán: P.103 & P.002 - 97 VVT | (028) 39307533 / (028) 39302342 | trungtamhoclieu@ou.edu.vn.
• TT Đào tạo ngắn hạn & NN-TH: P.215 - 97 VVT | (028) 39308339 | www.csc.ou.edu.vn.
• TT Đào tạo Từ xa: P.004 - 97 VVT | (028) 39300155 | tuvan@oude.edu.vn.
• TT Đào tạo Trực tuyến: P.505 - 97 VVT | 1800 6119 (phím 2) | tuyensinh@elo.edu.vn.
• Khoa Sau đại học: P.110 - 97 VVT | (028) 39300946 - (028) 39300947 | postgraduate@ou.edu.vn.`,
    },
    {
        id: "PB-02",
        topic: "PHONG_BAN",
        title: "Danh bạ 12 Khoa đào tạo & các Ngành học tại OU",
        keywords: [
            "khoa", "văn phòng khoa", "ngành học", "công nghệ thông tin", "kế toán", "kiểm toán",
            "kinh tế", "quản lý công", "luật", "ngoại ngữ", "quản trị kinh doanh", "tài chính ngân hàng",
            "xã hội học", "công tác xã hội", "xây dựng", "công nghệ sinh học", "đào tạo đặc biệt",
            "khoa học cơ bản", "khoa học dữ liệu", "trí tuệ nhân tạo", "fintech", "logistics",
        ],
        summary: "Thông tin liên hệ văn phòng các Khoa đào tạo đại học tại 35-37 Hồ Hảo Hớn (Q.1) và 97 Võ Văn Tần (Q.3).",
        content: `1. Khoa Đào tạo Đặc biệt (12 ngành CLC):
• Địa chỉ: P.007 - 97 Võ Văn Tần, Q.3 | ĐT: (028) 39309918 | Email: sas@ou.edu.vn | Web: www.ou.edu.vn/dacbiet.

2. Các Khoa tại cơ sở 35-37 Hồ Hảo Hớn, Quận 1:
• Công nghệ Thông tin (CNTT, HTTTQL, KHMT, AI): P.604 | (028) 38386603 | fcs@ou.edu.vn | www.it.ou.edu.vn.
• Khoa học Cơ bản (Khoa học dữ liệu): P.502 | (028) 38386607 | khoakhcb@ou.edu.vn | www.ou.edu.vn/bancoban.
• Công nghệ Sinh học (CNSH, CN Thực phẩm): P.602 | (028) 38386602 | khoacongnghesinhhoc@ou.edu.vn.
• Kế toán – Kiểm toán: P.105 | (028) 38386608 | ktkt@ou.edu.vn.
• Kinh tế & Quản lý công: P.603 | (028) 38386615 | khoaktqlc@ou.edu.vn.
• Luật (Luật, Luật kinh tế): P.102 | (028) 38386601 | khoaluat.dhm@ou.edu.vn.
• Ngoại ngữ (Anh, Trung, Nhật, Hàn): P.503 | (028) 38386606 | khoangoaingu@ou.edu.vn.
• Quản trị Kinh doanh (QTKD, KDQT, Nhân lực, Marketing, Du lịch, Logistics): P.403 | (028) 38386604 | qtkd@ou.edu.vn.
• Tài chính – Ngân hàng (TCNH, Fintech, Bảo hiểm): P.402 | (028) 38386605 | tcnh@ou.edu.vn.
• Xã hội học – CTXH – ĐNA (XHH, CTXH, ĐNÁ học, Tâm lý học): P.703 | (028) 38386616 | khoaxhh@ou.edu.vn.
• Xây dựng (CNKT CTXD, Quản lý XD): P.705 | (028) 38386617 | xaydung@ou.edu.vn.`,
    },
    {
        id: "PB-03",
        topic: "PHONG_BAN",
        title: "Số điện thoại Tổ quản lý lớp học các cơ sở & Hotline An ninh sinh viên",
        keywords: [
            "số điện thoại", "hotline an ninh", "an ninh sinh viên", "tổ quản lý lớp học",
            "tổ quản lý cơ sở vật chất", "ninh hòa", "long bình", "bình dương", "nhà bè",
        ],
        summary: "Hotline An ninh sinh viên: 028 39 330 660, cùng số điện thoại trực tiếp các cơ sở và Tổ quản lý lớp học.",
        content: `1. Hotline An ninh Sinh viên:
• 028 39 330 660

2. Tổ Quản lý lớp học / Cơ sở vật chất tại TP.HCM:
• Số 97 Võ Văn Tần: 028 39 308 828
• Số 35-37 Hồ Hảo Hớn: 028 38 386 636
• Số 02 Mai Thị Lựu: 028 38 242 599
• Cơ sở Nhơn Đức, Nhà Bè: 028 35 359 401

3. Các cơ sở ngoài TP.HCM:
• Cơ sở Long Bình (Đồng Nai): 0251 8826399 / 8826480 / 8826481 / 8826482 / 8826483 / 8826484
• Cơ sở Bình Dương: 0274 3822 456 | 0274 3840 080 | 0274 3828 631
• Cơ sở Ninh Hòa (Khánh Hòa): 02583 634 540 | 02583 630 333`,
    },
];

/**
 * Tìm kiếm bài viết sổ tay phù hợp (hỗ trợ cả tiếng Việt có dấu và không dấu)
 */
export function searchHandbookArticles(query: string): HandbookArticle[] {
    const cleanQuery = query.toLowerCase().trim();
    const normQuery = removeVietnameseDiacritics(cleanQuery);
    if (!normQuery) return [];

    const words = normQuery.split(/\s+/).filter((w) => w.length > 1);

    const scored = HANDBOOK_ARTICLES.map((article) => {
        const normTitle = removeVietnameseDiacritics(article.title);
        const normSummary = removeVietnameseDiacritics(article.summary);
        const normContent = removeVietnameseDiacritics(article.content);
        const normKeywords = article.keywords.map((kw) => removeVietnameseDiacritics(kw));

        let score = 0;

        // 1. Khớp cụm từ trực tiếp ở tiêu đề
        if (normTitle.includes(normQuery)) {
            score += 15;
        }

        // 2. Khớp từ khóa (exact hoặc chứa trong câu hỏi)
        for (const kw of normKeywords) {
            if (!kw) continue;
            if (normQuery === kw) {
                score += 18;
            } else if (normQuery.includes(kw)) {
                score += 8;
            } else if (kw.includes(normQuery) && normQuery.length >= 3) {
                score += 6;
            }
        }

        // 3. Khớp cụm từ ở tóm tắt hoặc nội dung
        if (normSummary.includes(normQuery)) score += 5;
        if (normContent.includes(normQuery)) score += 4;

        // 4. Khớp từng từ đơn
        for (const word of words) {
            if (normTitle.includes(word)) score += 2.5;
            if (normKeywords.some((kw) => kw.includes(word))) score += 2;
            if (normSummary.includes(word)) score += 0.8;
            if (normContent.includes(word)) score += 0.4;
        }

        return { article, score };
    });

    return scored
        .filter((item) => item.score >= 3)
        .sort((a, b) => b.score - a.score)
        .map((item) => item.article);
}
