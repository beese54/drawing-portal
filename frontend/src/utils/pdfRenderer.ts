import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerSrc;

export interface RenderedPdf {
  dataUrl: string;
  naturalWidth: number;
  naturalHeight: number;
}

export async function renderPdfPageToDataUrl(file: File, pageNumber = 1): Promise<RenderedPdf> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(pageNumber);

  const viewport0 = page.getViewport({ scale: 1 });
  // Cap render width at 2000px for reasonable memory usage
  const renderScale = Math.min(2.0, 2000 / viewport0.width);
  const viewport = page.getViewport({ scale: renderScale });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  const ctx = canvas.getContext('2d')!;
  await page.render({ canvasContext: ctx, viewport }).promise;

  return {
    dataUrl: canvas.toDataURL('image/png'),
    naturalWidth: viewport.width,
    naturalHeight: viewport.height,
  };
}
