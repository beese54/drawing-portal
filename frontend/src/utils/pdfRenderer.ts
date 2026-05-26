import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerSrc;

export interface RenderedPdf {
  dataUrl: string;
  naturalWidth: number;
  naturalHeight: number;
}

// Threshold for "blank" pixel: white or near-white, or fully transparent.
const BLANK_THRESHOLD = 240;

/**
 * Scan rendered pixel data to find the tightest bounding box of non-blank
 * content.  Scans rows first (cheap), then columns within that row range.
 * Returns null if the entire page is blank.
 */
function detectContentBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  padding = 24,
): { x: number; y: number; w: number; h: number } | null {
  const isPixelBlank = (i: number) =>
    data[i + 3] < 10 ||
    (data[i] >= BLANK_THRESHOLD && data[i + 1] >= BLANK_THRESHOLD && data[i + 2] >= BLANK_THRESHOLD);

  const isRowBlank = (y: number): boolean => {
    const base = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (!isPixelBlank(base + x * 4)) return false;
    }
    return true;
  };

  const isColBlank = (x: number, fromY: number, toY: number): boolean => {
    for (let y = fromY; y <= toY; y++) {
      if (!isPixelBlank((y * width + x) * 4)) return false;
    }
    return true;
  };

  // Find top and bottom non-blank rows
  let top = -1;
  for (let y = 0; y < height; y++) {
    if (!isRowBlank(y)) { top = y; break; }
  }
  if (top === -1) return null;

  let bottom = -1;
  for (let y = height - 1; y >= top; y--) {
    if (!isRowBlank(y)) { bottom = y; break; }
  }

  // Find left and right non-blank columns (within top–bottom range only)
  let left = -1;
  for (let x = 0; x < width; x++) {
    if (!isColBlank(x, top, bottom)) { left = x; break; }
  }
  if (left === -1) return null;

  let right = -1;
  for (let x = width - 1; x >= left; x--) {
    if (!isColBlank(x, top, bottom)) { right = x; break; }
  }

  const x = Math.max(0, left - padding);
  const y = Math.max(0, top - padding);
  const x2 = Math.min(width - 1, right + padding);
  const y2 = Math.min(height - 1, bottom + padding);

  return { x, y, w: x2 - x + 1, h: y2 - y + 1 };
}

export async function renderPdfPageToDataUrl(file: File, pageNumber = 1): Promise<RenderedPdf> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(pageNumber);

  const viewport0 = page.getViewport({ scale: 1 });
  // Cap render width at 2400px — higher resolution makes trimming more accurate
  const renderScale = Math.min(2.5, 2400 / viewport0.width);
  const viewport = page.getViewport({ scale: renderScale });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  const ctx = canvas.getContext('2d')!;
  // Fill white so transparent PDFs don't confuse the blank-detection
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: ctx, viewport }).promise;

  // Detect content bounding box and crop to it
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const bounds = detectContentBounds(imageData.data, canvas.width, canvas.height);

  if (bounds && (bounds.w < canvas.width * 0.98 || bounds.h < canvas.height * 0.98)) {
    // Meaningful whitespace found — crop to content
    const cropped = document.createElement('canvas');
    cropped.width = bounds.w;
    cropped.height = bounds.h;
    cropped.getContext('2d')!.drawImage(canvas, bounds.x, bounds.y, bounds.w, bounds.h, 0, 0, bounds.w, bounds.h);
    return {
      dataUrl: cropped.toDataURL('image/png'),
      naturalWidth: bounds.w,
      naturalHeight: bounds.h,
    };
  }

  return {
    dataUrl: canvas.toDataURL('image/png'),
    naturalWidth: canvas.width,
    naturalHeight: canvas.height,
  };
}
