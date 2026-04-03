/**
 * Prepares a receipt image for Gemini OCR with a 3-step enhancement pipeline:
 *   1. Smart resize  — upscale small images (far-away receipt), cap at 1800px
 *   2. Contrast/brightness boost — compensates for bad lighting & shadows
 *   3. Unsharp mask  — sharpens character edges so Gemini reads text more accurately
 *
 * Caller signature is unchanged: prepareImage(file) → { blob, mimeType }
 */
export async function prepareImage(
  file: File
): Promise<{ blob: Blob; mimeType: string }> {
  const img = await createImageBitmap(file);

  // ── Step 1: Smart resize ─────────────────────────────────────────────────
  // If the receipt is small in frame (far-away shot), upscale to 1800px first
  // so the enhancement steps have enough pixels to work with.
  // Always cap output at 1800px to stay within ~6 Gemini tiles (~258 tokens).
  const MAX = 1800;
  const longest = Math.max(img.width, img.height);
  const scale = longest < 1200
    ? MAX / longest          // upscale: small/far-away receipt
    : Math.min(1, MAX / longest); // downscale or keep: normal shot

  const w = Math.round(img.width  * scale);
  const h = Math.round(img.height * scale);

  // ── Step 2: Contrast + brightness ───────────────────────────────────────
  // Draw with CSS filter — single GPU-accelerated pass.
  // contrast(1.35): makes dark ink stand out against a light receipt background.
  // brightness(1.08): lifts shadows without blowing out white areas.
  const canvas = document.createElement('canvas');
  canvas.width  = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.filter = 'contrast(1.35) brightness(1.08)';
  ctx.drawImage(img, 0, 0, w, h);
  ctx.filter = 'none';

  // ── Step 3: Unsharp mask (3×3 sharpening convolution) ───────────────────
  // Sharpens character edges so Gemini's tokenizer sees crisp glyph boundaries.
  // Kernel:  0  -1   0
  //         -1   5  -1
  //          0  -1   0
  const imageData = ctx.getImageData(0, 0, w, h);
  const src  = imageData.data;
  const out  = new Uint8ClampedArray(src.length);
  const W    = w;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;

      if (x === 0 || x === W - 1 || y === 0 || y === h - 1) {
        // Border pixels: copy unchanged
        out[i]     = src[i];
        out[i + 1] = src[i + 1];
        out[i + 2] = src[i + 2];
        out[i + 3] = src[i + 3];
        continue;
      }

      // Apply kernel to R, G, B channels independently
      for (let c = 0; c < 3; c++) {
        const center = src[i + c];
        const top    = src[((y - 1) * W + x    ) * 4 + c];
        const bottom = src[((y + 1) * W + x    ) * 4 + c];
        const left   = src[(y       * W + x - 1) * 4 + c];
        const right  = src[(y       * W + x + 1) * 4 + c];

        // Uint8ClampedArray clamps automatically to [0, 255]
        out[i + c] = 5 * center - top - bottom - left - right;
      }
      out[i + 3] = src[i + 3]; // preserve alpha
    }
  }

  ctx.putImageData(new ImageData(out, w, h), 0, 0);

  // ── Output: JPEG 92% ─────────────────────────────────────────────────────
  // 92% (up from 90%) recovers fine detail that sharpening introduces
  // and that aggressive compression would smear back out.
  const blob = await new Promise<Blob>((res) =>
    canvas.toBlob(res as BlobCallback, 'image/jpeg', 0.92)
  );

  return { blob: blob!, mimeType: 'image/jpeg' };
}
