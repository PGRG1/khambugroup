/**
 * Compress an image file by resizing and converting to JPEG with quality reduction.
 * PDFs are returned as-is since they can't be client-side compressed easily.
 * Returns a compressed File object.
 */

const MAX_DIMENSION = 2400; // Max width or height in pixels
const JPEG_QUALITY = 0.65; // 65% quality — good balance of size vs readability

export async function compressImageFile(file: File): Promise<File> {
  // Don't compress PDFs — return as-is
  if (file.type === "application/pdf") return file;

  // Only compress image types
  if (!file.type.startsWith("image/")) return file;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;

      // Scale down if exceeds max dimension
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        if (width > height) {
          height = Math.round((height * MAX_DIMENSION) / width);
          width = MAX_DIMENSION;
        } else {
          width = Math.round((width * MAX_DIMENSION) / height);
          height = MAX_DIMENSION;
        }
      }

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
            console.log(`Compressed ${file.name}: ${(file.size / 1024).toFixed(0)}KB → ${(compressed.size / 1024).toFixed(0)}KB (${Math.round((1 - compressed.size / file.size) * 100)}% savings)`);
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
