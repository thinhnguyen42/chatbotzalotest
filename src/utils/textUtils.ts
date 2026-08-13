/**
 * Remove Vietnamese accents/diacritics from a string.
 * Example: "Nội quy nhà & PCCC" -> "noi quy nha & pccc"
 */
export function removeVietnameseDiacritics(str: string): string {
    if (!str) return "";
    return str
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "D")
        .toLowerCase()
        .trim();
}

/**
 * Clean common Vietnamese Telex typing errors & duplicate letter strikes.
 * Example: "dichh vụ" -> "dịch vụ"
 * Example: "phongg 101" -> "phong 101"
 * Example: "dja chi" -> "da chi"
 * Example: "noi qquy" -> "noi quy"
 */
export function normalizeTelexTypos(str: string): string {
    if (!str) return "";
    let s = str.toLowerCase();

    // Preserve special abbreviations like pccc
    s = s.replace(/\bpccc\b/gi, "__PCCC__");

    // 1. Collapse double-struck consonants from Telex (hh -> h, gg -> g, tt -> t, mm -> m, nn -> n, cc -> c, qq -> q)
    s = s.replace(/([bcdfghjklmnpqrstvwxz])\1+/g, "$1");

    // Restore PCCC abbreviation
    s = s.replace(/__pccc__/gi, "pccc");

    // 2. Fix Telex letter combinations (dja -> dia, dj -> di, dz -> d)
    s = s.replace(/\bdja/gi, "dia").replace(/\bdj/gi, "di").replace(/\bdz/gi, "d");

    return s.trim();
}

/**
 * Tách từ dính liền không có dấu cách (Unspaced Word Segmentation).
 * Example: "dichvu" -> "dich vu"
 * Example: "noiquy" -> "noi quy"
 * Example: "diachi" -> "dia chi"
 * Example: "baotri" -> "bao tri"
 * Example: "matkhau" -> "mat khau"
 * Example: "chaynha" -> "chay nha"
 */
export function splitUnspacedWords(str: string): string {
    if (!str) return "";
    let s = str;

    const UNSPACED_RULES: [RegExp, string][] = [
        [/\bdichvu\b/gi, "dich vu"],
        [/\bphidichvu\b/gi, "phi dich vu"],
        [/\bnoiquy\b/gi, "noi quy"],
        [/\bdiachi\b/gi, "dia chi"],
        [/\bbaotri\b/gi, "bao tri"],
        [/\bbaohong\b/gi, "bao hong"],
        [/\bguixe\b/gi, "gui xe"],
        [/\btraphong\b/gi, "tra phong"],
        [/\bmatkhau\b/gi, "mat khau"],
        [/\bpasswifi\b/gi, "pass wifi"],
        [/\bphongchay\b/gi, "phong chay"],
        [/\bchaynha\b/gi, "chay nha"],
        [/\btiendien\b/gi, "tien dien"],
        [/\btiennuoc\b/gi, "tien nuoc"],
        [/\blienhe\b/gi, "lien he"],
        [/\bthuephong\b/gi, "thue phong"],
        [/\bxemphong\b/gi, "xem phong"],
        [/\bgiahan\b/gi, "gia han"],
    ];

    for (const [pattern, replacement] of UNSPACED_RULES) {
        s = s.replace(pattern, replacement);
    }

    return s;
}

/**
 * Calculate Levenshtein edit distance between two strings.
 */
export function levenshteinDistance(a: string, b: string): number {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;

    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }

    return matrix[b.length][a.length];
}
