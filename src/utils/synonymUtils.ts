/**
 * Bộ từ điển mở rộng từ viết tắt và từ đồng nghĩa chuyên dùng cho Căn hộ / Tòa nhà.
 * Giúp RAG Engine và BM25 Search hiểu đúng ngữ nghĩa dù khách gõ tắt.
 */

// Hàm trợ giúp thay thế từ viết tắt đảm bảo không bị dính chữ (ví dụ: không nhầm 'kh' trong 'không')
function replaceWord(text: string, word: string, replacement: string): string {
    // Khớp khi từ đứng độc lập (bao quanh bởi khoảng trắng hoặc dấu câu)
    const regex = new RegExp(`(?:^|(?<=[\\s,.?!]))${word}(?=[\\s,.?!]|$)`, "gi");
    return text.replace(regex, replacement);
}

export function expandVietnameseAbbreviations(text: string): string {
    if (!text) return text;
    let expanded = text;

    // Viết tắt số phòng: p401 -> phòng 401, p.202 -> phòng 202
    expanded = expanded.replace(/(?:^|(?<=[\s,.?!]))p\.?(\d{3,4})(?=[[\s,.?!]|$)/gi, "phòng $1");

    // Thay thế các từ viết tắt chuyên biệt
    expanded = replaceWord(expanded, "đh", "điều hòa");
    expanded = replaceWord(expanded, "d/h", "điều hòa");
    expanded = replaceWord(expanded, "ml", "máy lạnh");
    expanded = replaceWord(expanded, "pccc", "phòng cháy chữa cháy");
    expanded = replaceWord(expanded, "dv", "dịch vụ");
    expanded = replaceWord(expanded, "bql", "ban quản lý");
    expanded = replaceWord(expanded, "kt", "kỹ thuật");
    expanded = replaceWord(expanded, "kh", "khách hàng");
    expanded = replaceWord(expanded, "wifi", "mạng internet wifi");
    expanded = replaceWord(expanded, "wfi", "mạng internet wifi");
    expanded = replaceWord(expanded, "pet", "thú cưng chó mèo");
    expanded = replaceWord(expanded, "hotline", "số điện thoại hotline ban quản lý");

    return expanded;
}
