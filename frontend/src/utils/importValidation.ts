/**
 * Validation for untrusted schematic JSON.
 *
 * A schematic file is the one artefact this service accepts from outside itself.
 * It is read entirely in the browser and never reaches the server, and `JSON.parse`
 * only ever builds plain data — it cannot execute code. So the threat here is not
 * code execution; it is what the *values* inside a well-formed file are allowed to
 * reach.
 *
 * Three things are enforced, each because of a specific sink:
 *
 *  1. STAMP IMAGES MUST BE base64 data-URLs. `title_block.ownerStamp`,
 *     `structuralEngineerStamp` and `lpPeStamp` are assigned straight to `img.src`
 *     (TitleBlockLayer.tsx, LpPeStampLayer.tsx). An unchecked value there lets a
 *     crafted file point the browser at a third-party URL — an outbound beacon that
 *     fires whenever the drawing is opened — and put an arbitrary image in the
 *     signature area of a regulatory drawing. Because metadataBuilder exports the
 *     title block wholesale, such a value round-trips and spreads between parties.
 *     The allowlist matches the upload control's own accept list in
 *     SheetSetupModal.tsx (png/jpeg/webp), so no legitimate stamp is affected.
 *     SVG is deliberately excluded: it is not offered on upload either.
 *
 *  2. COLOURS MUST BE #rrggbb. jsPDF's colour setters throw on anything they cannot
 *     parse, so one bad colour aborts the whole PDF export at a point with no obvious
 *     link back to the import. Applies to pipe `custom_color` (pdfVectorExport
 *     drawPipes) and annotation `color` (pdfVectorExport setTextColor) alike.
 *
 *  3. SHAPE AND MAGNITUDE ARE CHECKED AT RUNTIME. `JSON.parse(...) as DrawingMetadata`
 *     is a compile-time assertion only — types are erased, so it guarantees nothing
 *     about a file someone else wrote. The caps below deliberately mirror
 *     backend/app/config.py so the client and the evaluate/export endpoints agree on
 *     what is too big, rather than the browser accepting a drawing the server will
 *     then reject.
 *
 * Bad values are DROPPED, not fatal, wherever dropping leaves a coherent drawing —
 * a schematic with a hostile stamp still opens, without the stamp. Only structural
 * problems (wrong shape, over the caps) refuse the file, and they say why.
 */

// Mirrors backend/app/config.py — keep the two in step.
export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024; // config.max_image_bytes
export const MAX_ELEMENTS = 1000; // config.max_elements
export const MAX_PIPES = 2000; // config.max_pipes
export const MAX_ANNOTATIONS = 1000; // config.max_report_rows
/** Longest free-text field accepted (symbol names, annotation text, title-block entries). */
export const MAX_TEXT_LEN = 5000;
/** Longest stamp data-URL accepted. Comfortably above a real signature scan. */
export const MAX_DATA_URL_LEN = 4 * 1024 * 1024;

export const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** png/jpeg/webp only — the same set SheetSetupModal offers on upload. */
const SAFE_IMAGE_DATA_URL_RE = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

/**
 * Leading signature bytes for each accepted format.
 *
 * The MIME label inside a data-URL is just a string the file author chose — it
 * is not evidence of anything. Without this check `data:image/png;base64,<any
 * bytes at all>` passes, which turns a stamp field into a place to smuggle
 * arbitrary content through a drawing that PUB stores and forwards. Browsers
 * sniff the real type and simply fail to render a non-image, so this is a
 * content-integrity control rather than an execution one.
 */
const MAGIC: Record<string, (b: Uint8Array) => boolean> = {
  // \x89 P N G \r \n \x1a \n
  png: (b) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v),
  // SOI + marker
  jpeg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  // "RIFF" .... "WEBP"
  webp: (b) =>
    [0x52, 0x49, 0x46, 0x46].every((v, i) => b[i] === v) &&
    [0x57, 0x45, 0x42, 0x50].every((v, i) => b[8 + i] === v),
};

/** Decode just enough of the base64 payload to inspect its signature. */
function leadingBytes(b64: string, count = 16): Uint8Array | undefined {
  // atob needs whole 4-character groups; 24 chars decodes to 18 bytes.
  const groups = Math.ceil(count / 3);
  try {
    const bin = atob(b64.slice(0, groups * 4));
    const out = new Uint8Array(Math.min(bin.length, count));
    for (let i = 0; i < out.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return undefined; // not valid base64
  }
}

/** Thrown for structural problems. The message is shown to the user, so it says what to do. */
export class SchematicImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchematicImportError';
  }
}

/**
 * A stamp image, or undefined.
 *
 * Two gates: the URL must be a `data:` URL declaring png/jpeg/webp — which is
 * what stops it reaching the network at all — and the decoded bytes must
 * actually begin with that format's signature, so the declared type cannot lie.
 */
export function safeImageDataUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (value.length > MAX_DATA_URL_LEN) return undefined;

  const m = SAFE_IMAGE_DATA_URL_RE.exec(value);
  if (!m) return undefined;

  const format = value.slice('data:image/'.length, value.indexOf(';'));
  const bytes = leadingBytes(m[1]);
  if (!bytes || !MAGIC[format]?.(bytes)) return undefined;

  return value;
}

/**
 * Re-rasterise a stamp so only pixels survive.
 *
 * The signature check above proves a file *starts* like an image; it says
 * nothing about what is appended after the image data. Drawing it to a canvas
 * and reading it back keeps the decoded pixels and discards everything else —
 * trailing payloads, EXIF, colour profiles, polyglot tails — because the output
 * is re-encoded from the pixel buffer rather than copied.
 *
 * It also bounds dimensions, so a small file that decodes to an enormous bitmap
 * cannot be used as a memory bomb.
 *
 * Decoding happens in the browser's own image decoder — the same one that would
 * render the stamp anyway — so this adds no exposure that displaying it would
 * not already have. The source is always a `data:` URL by this point, so no
 * network request is possible.
 *
 * Returns undefined if the value will not decode, which is the correct outcome:
 * a stamp that is not an image is dropped.
 */
export function reencodeImageDataUrl(dataUrl: string, maxEdgePx = 2000): Promise<string | undefined> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v: string | undefined) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    // A stamp that never fires load or error must not hang the import.
    const timer = setTimeout(() => done(undefined), 10_000);

    const img = new Image();
    img.onerror = () => {
      clearTimeout(timer);
      done(undefined);
    };
    img.onload = () => {
      clearTimeout(timer);
      const { naturalWidth: nw, naturalHeight: nh } = img;
      if (!nw || !nh) return done(undefined);

      const scale = Math.min(1, maxEdgePx / Math.max(nw, nh));
      const w = Math.max(1, Math.round(nw * scale));
      const h = Math.max(1, Math.round(nh * scale));

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return done(undefined);
      ctx.drawImage(img, 0, 0, w, h);
      try {
        // PNG so signature stamps keep their transparency.
        done(canvas.toDataURL('image/png'));
      } catch {
        done(undefined); // tainted canvas — cannot happen for a data: URL, but fail closed
      }
    };
    img.src = dataUrl;
  });
}

/** Re-encode every stamp on an already-sanitised title block, dropping any that will not decode. */
export async function reencodeTitleBlockStamps(tb: Record<string, unknown>): Promise<Record<string, unknown>> {
  const out = { ...tb };
  for (const k of ['ownerStamp', 'structuralEngineerStamp', 'lpPeStamp']) {
    const v = out[k];
    if (typeof v !== 'string') continue;
    const clean = await reencodeImageDataUrl(v);
    if (clean) out[k] = clean;
    else delete out[k];
  }
  return out;
}

/** A #rrggbb colour, or undefined. */
export function safeHexColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return HEX_COLOR_RE.test(value) ? value : undefined;
}

/** A bounded string, or undefined. Over-long values are truncated rather than dropped. */
export function safeText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value.length > MAX_TEXT_LEN ? value.slice(0, MAX_TEXT_LEN) : value;
}

/** A finite number, or undefined. Rejects NaN and ±Infinity, which JSON.parse can produce via 1e999. */
export function safeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Copy a title block field by field, dropping anything that fails its check.
 *
 * Field-by-field rather than a spread: a spread would carry through any extra keys
 * the file happens to contain, and the three stamp fields are exactly the ones that
 * must not pass unchecked.
 */
export function sanitizeTitleBlock(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const tb = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  const textFields = [
    'ownerDeveloper', 'structuralEngineer', 'projectName', 'mainContractor',
    'plumbingContractor', 'drawingNo', 'drawnBy', 'checkedBy', 'date', 'rev',
    'projectNo', 'tenureOfLand',
  ];
  for (const k of textFields) {
    const v = safeText(tb[k]);
    if (v !== undefined) out[k] = v;
  }

  // The three sinks that reach img.src.
  for (const k of ['ownerStamp', 'structuralEngineerStamp', 'lpPeStamp']) {
    const v = safeImageDataUrl(tb[k]);
    if (v !== undefined) out[k] = v;
  }

  for (const k of ['lpPeStampX', 'lpPeStampY', 'lpPeStampSize']) {
    const v = safeNumber(tb[k]);
    if (v !== undefined) out[k] = v;
  }

  return out;
}

/**
 * Structural check, run before anything is read out of the parsed object.
 *
 * Throws SchematicImportError with a specific message; the caller shows it verbatim.
 */
export function validateSchematicShape(data: unknown): void {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new SchematicImportError('The file does not contain a schematic object.');
  }
  const d = data as Record<string, unknown>;

  if (d.schema_version !== '1.0') {
    throw new SchematicImportError(
      `Unsupported schema version ${JSON.stringify(d.schema_version ?? null)}. Only version "1.0" is supported.`,
    );
  }

  const arrays: [string, number][] = [
    ['elements', MAX_ELEMENTS],
    ['pipes', MAX_PIPES],
  ];
  for (const [key, cap] of arrays) {
    const v = d[key];
    if (!Array.isArray(v)) {
      throw new SchematicImportError(`The file is missing its "${key}" list, or it is not a list.`);
    }
    if (v.length > cap) {
      throw new SchematicImportError(
        `This schematic has ${v.length.toLocaleString()} ${key}, over the ${cap.toLocaleString()} limit.`,
      );
    }
  }

  if (d.annotations !== undefined && d.annotations !== null) {
    if (!Array.isArray(d.annotations)) {
      throw new SchematicImportError('The file\'s "annotations" entry is not a list.');
    }
    if (d.annotations.length > MAX_ANNOTATIONS) {
      throw new SchematicImportError(
        `This schematic has ${d.annotations.length.toLocaleString()} annotations, over the ${MAX_ANNOTATIONS.toLocaleString()} limit.`,
      );
    }
  }

  const mrl = d.mrl_config;
  if (!mrl || typeof mrl !== 'object' || safeNumber((mrl as Record<string, unknown>).lower_mrl) === undefined) {
    throw new SchematicImportError('The file is missing a valid "mrl_config.lower_mrl" value.');
  }

  for (const [i, el] of (d.elements as unknown[]).entries()) {
    if (!el || typeof el !== 'object' || Array.isArray(el)) {
      throw new SchematicImportError(`Element ${i + 1} in the file is not an object.`);
    }
    const pos = (el as Record<string, unknown>).position;
    if (!pos || typeof pos !== 'object') {
      throw new SchematicImportError(`Element ${i + 1} in the file has no position.`);
    }
  }

  for (const [i, p] of (d.pipes as unknown[]).entries()) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) {
      throw new SchematicImportError(`Pipe ${i + 1} in the file is not an object.`);
    }
    const pp = p as Record<string, unknown>;
    if (!pp.start || typeof pp.start !== 'object' || !pp.end || typeof pp.end !== 'object') {
      throw new SchematicImportError(`Pipe ${i + 1} in the file has no start or end point.`);
    }
  }
}
