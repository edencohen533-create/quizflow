// Crops away blank padding (transparent or near-white) baked into an
// uploaded image's own canvas — common in exported logos — so it renders
// filling its card the way it looks in the original design file, instead
// of floating small inside a mostly-empty box. Falls back to the original
// file untouched if there's nothing meaningful to trim or anything fails.
export async function trimImagePadding(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0);
    const { data } = ctx.getImageData(0, 0, width, height);

    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const a = data[i + 3];
        const distFromWhite = 255 - data[i] + (255 - data[i + 1]) + (255 - data[i + 2]);
        if (a > 20 && distFromWhite > 40) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    // nothing detected, or the content already spans (almost) the whole
    // canvas — leave the original file as-is
    if (maxX < 0) return file;
    const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.04);
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(width - 1, maxX + pad);
    maxY = Math.min(height - 1, maxY + pad);
    const trimmedWidth = maxX - minX + 1;
    const trimmedHeight = maxY - minY + 1;
    if (trimmedWidth >= width * 0.98 && trimmedHeight >= height * 0.98) return file;

    const trimmedCanvas = document.createElement("canvas");
    trimmedCanvas.width = trimmedWidth;
    trimmedCanvas.height = trimmedHeight;
    const trimmedCtx = trimmedCanvas.getContext("2d");
    if (!trimmedCtx) return file;
    trimmedCtx.drawImage(canvas, minX, minY, trimmedWidth, trimmedHeight, 0, 0, trimmedWidth, trimmedHeight);

    const blob: Blob | null = await new Promise((resolve) => trimmedCanvas.toBlob(resolve, "image/png"));
    if (!blob) return file;
    return new File([blob], file.name, { type: "image/png" });
  } catch {
    return file;
  }
}
