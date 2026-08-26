import { getFileExtension } from "@/lib/jobs/validation";

export class TextExtractionError extends Error {}

export async function extractTextFromFile(
  buffer: Buffer,
  fileName: string,
): Promise<string> {
  const extension = getFileExtension(fileName);

  try {
    if (extension === "txt") {
      return buffer.toString("utf-8");
    }

    if (extension === "pdf") {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: buffer });
      try {
        const result = await parser.getText();
        return result.text;
      } finally {
        await parser.destroy();
      }
    }

    if (extension === "docx") {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }
  } catch {
    throw new TextExtractionError("We couldn't read text from this file.");
  }

  throw new TextExtractionError("Unsupported file type for text extraction.");
}
