export const ACCEPTED_JD_EXTENSIONS = ["pdf", "docx", "txt"] as const;
export type AcceptedJdExtension = (typeof ACCEPTED_JD_EXTENSIONS)[number];

export const MAX_JD_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export function getFileExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

export function validateJdFile(file: { name: string; size: number }): string | null {
  const extension = getFileExtension(file.name);

  if (!ACCEPTED_JD_EXTENSIONS.includes(extension as AcceptedJdExtension)) {
    return "Unsupported file type. Upload a PDF, DOCX, or TXT file.";
  }
  if (file.size === 0) {
    return "That file is empty.";
  }
  if (file.size > MAX_JD_FILE_SIZE_BYTES) {
    return "File must be smaller than 10MB.";
  }
  return null;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
