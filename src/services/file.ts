import axios from "axios";
import pdf from "pdf-parse";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { RagService } from "./rag";


export class FileService {
  private static llm = new ChatGoogleGenerativeAI({
    model: "gemini-2.0-flash",
    temperature: 0.3,
    apiKey: process.env.GOOGLE_API_KEY,
  });

  /**
   * Tải file từ URL Zalo về dạng Buffer
   */
  private static async downloadFile(fileUrl: string): Promise<Buffer> {
    const response = await axios.get(fileUrl, {
      responseType: "arraybuffer",
      timeout: 30000,
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });
    return Buffer.from(response.data);
  }

  /**
   * Bóc tách text từ file tùy định dạng
   */
  private static async extractText(buffer: Buffer, fileName: string): Promise<string> {
    const ext = fileName.toLowerCase();

    // ── PDF ──────────────────────────────────────────
    if (ext.endsWith(".pdf")) {
      const pdfData = await pdf(buffer);
      return pdfData.text;
    }

    // ── DOCX (Word) ───────────────────────────────────
    if (ext.endsWith(".docx") || ext.endsWith(".doc")) {
      const result = await mammoth.extractRawText({ buffer });
      if (result.messages.length > 0) {
        console.warn("[FILE] Cảnh báo khi đọc DOCX:", result.messages);
      }
      return result.value;
    }

    // ── Excel (.xlsx / .xls) ──────────────────────────
    if (ext.endsWith(".xlsx") || ext.endsWith(".xls")) {
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const lines: string[] = [];

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        // Convert sheet sang JSON (mảng các hàng)
        const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

        lines.push(`\n=== Sheet: ${sheetName} ===`);
        for (const row of rows) {
          const rowText = row
            .map(cell => String(cell ?? "").trim())
            .filter(cell => cell !== "")
            .join(" | ");
          if (rowText) lines.push(rowText);
        }
      }

      return lines.join("\n");
    }

    // ── CSV ───────────────────────────────────────────
    if (ext.endsWith(".csv")) {
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      return rows
        .map(row => row.map(cell => String(cell ?? "").trim()).join(" | "))
        .filter(line => line.trim() !== "")
        .join("\n");
    }

    // ── TXT / Markdown ────────────────────────────────
    if (ext.endsWith(".txt") || ext.endsWith(".md")) {
      return buffer.toString("utf-8");
    }

    throw new Error(
      `Định dạng file không được hỗ trợ: "${fileName.split(".").pop()}"\n` +
      `Hỗ trợ: PDF, DOCX, DOC, XLSX, XLS, CSV, TXT, MD`
    );
  }

  /**
   * Tóm tắt nội dung tài liệu bằng Gemini
   */
  private static async summarizeDocument(text: string, fileName: string): Promise<string> {
    // Giới hạn text gửi vào (tránh vượt context window)
    const truncatedText = text.length > 15000 ? text.slice(0, 15000) + "..." : text;

    const prompt = ChatPromptTemplate.fromMessages([
      ["system", `Bạn là AI chuyên tóm tắt tài liệu cho hệ thống chatbot Zalo OA.
Hãy tóm tắt nội dung tài liệu theo cấu trúc sau:
1. **Tên tài liệu**: (tên file)
2. **Nội dung chính**: (2-3 câu mô tả tổng quan)
3. **Các điểm quan trọng**: (liệt kê 3-5 điểm nổi bật)
4. **Khách hàng có thể hỏi về**: (2-3 chủ đề phổ biến từ tài liệu này)

Trả lời bằng tiếng Việt, ngắn gọn, dễ hiểu.`],
      ["human", `Tên file: ${fileName}\n\nNội dung tài liệu:\n${truncatedText}`],
    ]);

    const chain = prompt.pipe(this.llm);
    const response = await chain.invoke({});
    return typeof response.content === "string" ? response.content : String(response.content);
  }

  /**
   * Xử lý toàn bộ flow: Tải → Parse → Tóm tắt → Nạp RAG
   * @returns Object chứa tóm tắt và số chunks đã nạp
   */
  static async processFile(
    fileUrl: string,
    fileName: string,
    senderName: string
  ): Promise<{ summary: string; chunks: number }> {
    console.log(`[FILE] Bắt đầu xử lý file: "${fileName}" từ ${senderName}`);

    // BƯỚC 1: Tải file
    console.log(`[FILE] Đang tải file từ URL...`);
    const buffer = await this.downloadFile(fileUrl);
    console.log(`[FILE] Tải xong, kích thước: ${(buffer.length / 1024).toFixed(1)} KB`);

    // BƯỚC 2: Bóc tách text
    console.log(`[FILE] Đang bóc tách text từ "${fileName}"...`);
    const rawText = await this.extractText(buffer, fileName);

    if (!rawText || rawText.trim().length < 50) {
      throw new Error(`Không bóc tách được nội dung từ file. File có thể bị mã hóa hoặc chỉ chứa hình ảnh.`);
    }

    console.log(`[FILE] Bóc tách được ${rawText.length} ký tự.`);

    // BƯỚC 3: Tóm tắt bằng Gemini (chạy song song với nạp RAG)
    console.log(`[FILE] Đang tóm tắt và nạp vào RAG...`);
    const [summary, chunks] = await Promise.all([
      this.summarizeDocument(rawText, fileName),
      RagService.ingestDocument(rawText, fileName),
    ]);

    console.log(`[FILE] Hoàn tất! ${chunks} chunks nạp vào RAG.`);

    return { summary, chunks };
  }
}
