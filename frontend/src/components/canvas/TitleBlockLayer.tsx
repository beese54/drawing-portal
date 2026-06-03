import { useEffect, useState } from 'react';
import { Layer, Rect, Text, Line, Image as KonvaImage } from 'react-konva';
import {
  TITLE_BLOCK_MM, SHEET_PX_PER_MM, PAPER_SIZES_MM, AXIS_WIDTH,
  type SheetConfig,
} from '../../types';

interface Props {
  sheetConfig: SheetConfig;
}

const BORDER  = '#2a2a2a';
const LBL_CLR = '#555';
const VAL_CLR = '#111';
const LBL_SZ  = 5.5;
const VAL_SZ  = 6.5;
const LINE_H  = 8.5;   // px per text line at VAL_SZ with spacing
const PAD     = 6;

// Estimate rendered height for a block section
function blockH(text: string | undefined, minH: number, hasSign = false): number {
  const lines = text?.trim() ? text.split('\n').length : 0;
  const textH = lines * LINE_H;
  const signH = hasSign ? 14 : 0;
  return Math.max(minH, PAD + LBL_SZ + 6 + textH + signH + PAD);
}

export function TitleBlockLayer({ sheetConfig }: Props) {
  const { titleBlock, paperSize, drawingScale } = sheetConfig;

  const paperW = PAPER_SIZES_MM[paperSize].w * SHEET_PX_PER_MM;
  const paperH = PAPER_SIZES_MM[paperSize].h * SHEET_PX_PER_MM;
  const tbW    = TITLE_BLOCK_MM * SHEET_PX_PER_MM;
  const tbX    = AXIS_WIDTH + paperW - tbW;

  const [ownerStampImg, setOwnerStampImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!titleBlock.ownerStamp) { setOwnerStampImg(null); return; }
    const img = new window.Image();
    img.onload = () => setOwnerStampImg(img);
    img.src = titleBlock.ownerStamp;
  }, [titleBlock.ownerStamp]);

  const [stampImg, setStampImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!titleBlock.stampImage) { setStampImg(null); return; }
    const img = new window.Image();
    img.onload = () => setStampImg(img);
    img.src = titleBlock.stampImage;
  }, [titleBlock.stampImage]);

  // ── Fixed heights ──────────────────────────────────────────────
  const headerH = 34;
  const btRowH  = 20;
  const dtRowH  = 26;
  const bottomH = dtRowH + 3 * btRowH;

  // ── Natural heights per block ──────────────────────────────────
  const ownerStampExtraH = ownerStampImg ? 50 : 0;
  const stampExtraH      = stampImg      ? 50 : 0;
  const natOwner  = blockH(titleBlock.ownerDeveloper, 38, true) + ownerStampExtraH;
  const natLp     = blockH(titleBlock.lpEngineer,         38, true) + stampExtraH;
  const natProj   = blockH(titleBlock.projectName,        32);
  const natMain   = blockH(titleBlock.mainContractor,     32);
  const natPlumb  = blockH(titleBlock.plumbingContractor, 32);

  const available = paperH - headerH - bottomH;
  const totalNat  = natOwner + natLp + natProj + natMain + natPlumb;

  // Scale down proportionally if content overflows; distribute surplus evenly
  const scale = totalNat > available ? available / totalNat : 1;
  const bonus = totalNat < available ? (available - totalNat) / 5 : 0;

  const ownerH = Math.round(natOwner * scale + bonus);
  const lpH    = Math.round(natLp    * scale + bonus);
  const projH  = Math.round(natProj  * scale + bonus);
  const mainH  = Math.round(natMain  * scale + bonus);
  const plumbH = available - ownerH - lpH - projH - mainH;

  // ── Y anchors ──────────────────────────────────────────────────
  const yH      = 0;
  const yOwner  = headerH;
  const yLp     = yOwner + ownerH;
  const yProj   = yLp    + lpH;
  const yMain   = yProj  + projH;
  const yPlumb  = yMain  + mainH;
  const yBottom = paperH - bottomH;
  const yDt     = yBottom;
  const yRow1   = yDt   + dtRowH;
  const yRow2   = yRow1 + btRowH;
  const yRow3   = yRow2 + btRowH;

  const col1W = Math.round(tbW * 0.55);
  const col2W = tbW - col1W;
  const bw    = 0.75;

  // Helper: renders label + multiline value inside a cell
  const BlockText = (x: number, y: number, label: string, text: string | undefined) => [
    <Text key={`lbl-${label}`} x={x + PAD} y={y + PAD}
          text={label} fontSize={LBL_SZ} fill={LBL_CLR} />,
    <Text key={`val-${label}`}
          x={x + PAD} y={y + PAD + LBL_SZ + 4}
          width={tbW - PAD * 2}
          text={text || ''}
          fontSize={VAL_SZ} fill={VAL_CLR}
          lineHeight={1.35} wrap="word" />,
  ];

  return (
    <Layer listening={false}>
      <Rect x={tbX} y={0} width={tbW} height={paperH} fill="#fff" />
      <Line points={[tbX, 0, tbX, paperH]} stroke={BORDER} strokeWidth={1.5} />

      {/* ═══ HEADER ══════════════════════════════════════════════ */}
      <Rect x={tbX} y={yH} width={tbW} height={headerH}
            fill="#fff" stroke={BORDER} strokeWidth={bw} />
      <Text x={tbX} y={yH} width={tbW} height={headerH}
            text="SCHEMATIC DRAWING"
            fontSize={11} fontStyle="bold" fill="#111"
            align="center" verticalAlign="middle" />

      {/* ═══ OWNER / DEVELOPER ═══════════════════════════════════ */}
      <Rect x={tbX} y={yOwner} width={tbW} height={ownerH}
            fill="#fff" stroke={BORDER} strokeWidth={bw} />
      {BlockText(tbX, yOwner, 'OWNER / DEVELOPER :', titleBlock.ownerDeveloper)}
      {ownerStampImg && (() => {
        const maxW = tbW - PAD * 4;
        const maxH = Math.min(ownerStampExtraH - 4, ownerH - 40);
        if (maxH <= 0) return null;
        const s  = Math.min(maxW / ownerStampImg.width, maxH / ownerStampImg.height, 1);
        const sw = ownerStampImg.width  * s;
        const sh = ownerStampImg.height * s;
        return (
          <KonvaImage
            key="owner-stamp"
            image={ownerStampImg}
            x={tbX + (tbW - sw) / 2}
            y={yOwner + ownerH - ownerStampExtraH + (ownerStampExtraH - sh) / 2 - 4}
            width={sw} height={sh}
          />
        );
      })()}
      <Text x={tbX + PAD} y={yOwner + ownerH - 13}
            text="SIGN :" fontSize={LBL_SZ} fill={LBL_CLR} />

      {/* ═══ LP / PE ENGINEER ════════════════════════════════════ */}
      <Rect x={tbX} y={yLp} width={tbW} height={lpH}
            fill="#fff" stroke={BORDER} strokeWidth={bw} />
      {BlockText(tbX, yLp, 'LP / PE ENGINEER :', titleBlock.lpEngineer)}
      {stampImg && (() => {
        const maxW = tbW - PAD * 4;
        const maxH = Math.min(stampExtraH - 4, lpH - 40);
        if (maxH <= 0) return null;
        const s  = Math.min(maxW / stampImg.width, maxH / stampImg.height, 1);
        const sw = stampImg.width  * s;
        const sh = stampImg.height * s;
        return (
          <KonvaImage
            key="stamp"
            image={stampImg}
            x={tbX + (tbW - sw) / 2}
            y={yLp + lpH - stampExtraH + (stampExtraH - sh) / 2 - 4}
            width={sw} height={sh}
          />
        );
      })()}
      <Text x={tbX + PAD} y={yLp + lpH - 13}
            text="SIGN :" fontSize={LBL_SZ} fill={LBL_CLR} />

      {/* ═══ PROJECT TITLE ════════════════════════════════════════ */}
      <Rect x={tbX} y={yProj} width={tbW} height={projH}
            fill="#fff" stroke={BORDER} strokeWidth={bw} />
      {BlockText(tbX, yProj, 'PROJECT TITLE', titleBlock.projectName)}

      {/* ═══ MAIN CON ═════════════════════════════════════════════ */}
      <Rect x={tbX} y={yMain} width={tbW} height={mainH}
            fill="#fff" stroke={BORDER} strokeWidth={bw} />
      {BlockText(tbX, yMain, 'MAIN CON :', titleBlock.mainContractor)}

      {/* ═══ PLUMBING CONTRACTOR ══════════════════════════════════ */}
      <Rect x={tbX} y={yPlumb} width={tbW} height={plumbH}
            fill="#fff" stroke={BORDER} strokeWidth={bw} />
      {BlockText(tbX, yPlumb, 'PLUMBING CONTRACTOR', titleBlock.plumbingContractor)}

      {/* ═══ DRAWING TITLE ════════════════════════════════════════ */}
      <Rect x={tbX} y={yDt} width={tbW} height={dtRowH}
            fill="#fff" stroke={BORDER} strokeWidth={bw} />
      <Text x={tbX + PAD} y={yDt + 3}
            text="DRAWING TITLE" fontSize={5} fill={LBL_CLR} />
      <Text x={tbX + PAD} y={yDt + 11}
            text="SCHEMATIC PLUMBING DRAWING"
            fontSize={6} fontStyle="bold" fill={VAL_CLR} />

      {/* ═══ Row 1 — DRAWN BY | DATE ══════════════════════════════ */}
      <Rect x={tbX}        y={yRow1} width={col1W} height={btRowH} fill="#fff" stroke={BORDER} strokeWidth={bw} />
      <Text x={tbX + PAD}  y={yRow1 + 2}  text="DRAWN BY"               fontSize={5}    fill={LBL_CLR} />
      <Text x={tbX + PAD}  y={yRow1 + 10} text={titleBlock.drawnBy || '—'} fontSize={VAL_SZ} fill={VAL_CLR} />
      <Rect x={tbX + col1W} y={yRow1} width={col2W} height={btRowH} fill="#fff" stroke={BORDER} strokeWidth={bw} />
      <Text x={tbX + col1W + PAD} y={yRow1 + 2}  text="DATE"             fontSize={5}    fill={LBL_CLR} />
      <Text x={tbX + col1W + PAD} y={yRow1 + 10} text={titleBlock.date || '—'} fontSize={VAL_SZ} fill={VAL_CLR} />

      {/* ═══ Row 2 — CHECKED | SCALE ══════════════════════════════ */}
      <Rect x={tbX}        y={yRow2} width={col1W} height={btRowH} fill="#fff" stroke={BORDER} strokeWidth={bw} />
      <Text x={tbX + PAD}  y={yRow2 + 2}  text="CHECKED"                  fontSize={5}    fill={LBL_CLR} />
      <Text x={tbX + PAD}  y={yRow2 + 10} text={titleBlock.checkedBy || '—'} fontSize={VAL_SZ} fill={VAL_CLR} />
      <Rect x={tbX + col1W} y={yRow2} width={col2W} height={btRowH} fill="#fff" stroke={BORDER} strokeWidth={bw} />
      <Text x={tbX + col1W + PAD} y={yRow2 + 2}  text="SCALE"             fontSize={5}    fill={LBL_CLR} />
      <Text x={tbX + col1W + PAD} y={yRow2 + 10} text={`1:${drawingScale}`} fontSize={VAL_SZ} fill={VAL_CLR} />

      {/* ═══ Row 3 — DRAWING NO. | REV. ══════════════════════════ */}
      <Rect x={tbX}        y={yRow3} width={col1W} height={btRowH} fill="#fff" stroke={BORDER} strokeWidth={bw} />
      <Text x={tbX + PAD}  y={yRow3 + 2}  text="DRAWING NO."               fontSize={5}    fill={LBL_CLR} />
      <Text x={tbX + PAD}  y={yRow3 + 10} text={titleBlock.drawingNo || '—'} fontSize={VAL_SZ} fill={VAL_CLR} />
      <Rect x={tbX + col1W} y={yRow3} width={col2W} height={btRowH} fill="#fff" stroke={BORDER} strokeWidth={bw} />
      <Text x={tbX + col1W + PAD} y={yRow3 + 2}  text="REV."               fontSize={5}    fill={LBL_CLR} />
      <Text x={tbX + col1W + PAD} y={yRow3 + 10} text={titleBlock.rev || '—'} fontSize={VAL_SZ} fill={VAL_CLR} />

    </Layer>
  );
}
