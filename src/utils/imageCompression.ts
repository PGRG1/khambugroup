/**
 * Prepare an image file for upload/OCR.
 *
 * Source fidelity matters more than bytes: an invoice photo that is already a
 * reasonable size is uploaded untouched, so no OCR detail is destroyed by a
 * pointless re-encode. Only oversized images are resized, and then at high
 * JPEG quality. PDFs are never touched.
 */

export const MAX_DIMENSION = 3200; // Max width or height in pixels after resize
export const JPEG_QUALITY = 0.9; // High quality — text/digit legibility first
export const PRESERVE_MAX_BYTES = 4 * 1024 * 1024; // ~4MB
export const PRESERVE_MAX_DIMENSION = 3200;

/**
 * Pure decision helper: should this file be re-encoded at all?
 * An image is preserved as-is when it is within both the dimension and size budget.
 */
export function shouldRecompress(input: {
  type: string;
  size: number;
  width: number;
  height: number;
}): boolean {
  if (input.type === "application/pdf") return false;
  if (!input.type.startsWith("image/")) return false;
  const longestEdge = Math.max(input.width, input.height);
  if (longestEdge <= PRESERVE_MAX_DIMENSION && input.size <= PRESERVE_MAX_BYTES) return false;
  return true;
}

/** Pure helper: target dimensions after capping the longest edge at MAX_DIMENSION. */
export function targetDimensions(width: number, height: number): { width: number; height: number } {
  if (width <= MAX_DIMENSION && height <= MAX_DIMENSION) return { width, height };
  if (width > height) {
    return { width: MAX_DIMENSION, height: Math.round((height * MAX_DIMENSION) / width) };
  }
  return { width: Math.round((width * MAX_DIMENSION) / height), height: MAX_DIMENSION };
}

export async function compressImageFile(file: File): Promise<File> {
  // Don't compress PDFs — return as-is
  if (file.type === "application/pdf") return file;

  // Only compress image types
  if (!file.type.startsWith("image/")) return file;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (!shouldRecompress({ type: file.type, size: file.size, width: img.width, height: img.height })) {
        resolve(file);
        return;
      }

      const { width, height } = targetDimensions(img.width, img.height);

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file); // fallback to original
            return;
          }
          // Replace extension with .jpg
          const name = file.name.replace(/\.[^.]+$/, ".jpg");
          const compressed = new File([blob], name, { type: "image/jpeg" });

          // Only use compressed if it's actually smaller
          if (compressed.size < file.size) {
            resolve(compressed);
          } else {
            resolve(file);
          }
        },
        "image/jpeg",
        JPEG_QUALITY
      );
    };
    img.onerror = () => resolve(file); // fallback
    img.src = URL.createObjectURL(file);
  });
}
