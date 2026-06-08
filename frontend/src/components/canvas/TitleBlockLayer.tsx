import React, { useEffect, useMemo, useState } from 'react';
import { Layer, Rect, Text, Line, Image as KonvaImage } from 'react-konva';
import {
  TITLE_BLOCK_MM, SHEET_PX_PER_MM, PAPER_SIZES_MM, AXIS_WIDTH,
  type SheetConfig,
} from '../../types';
import { useCanvasStore } from '../../store/canvasStore';
import { symbolsApi } from '../../api/client';

interface Props {
  sheetConfig: SheetConfig;
  onTitleBlockClick?: () => void;
}

const BORDER  = '#2a2a2a';
const LBL_CLR = '#555';
const VAL_CLR = '#111';
const LBL_SZ  = 5.5;
const VAL_SZ  = 6.5;
const LINE_H  = 8.5;
const PAD     = 6;

function blockH(text: string | undefined, minH: number, hasSign = false): number {
  const lines = text?.trim() ? text.split('\n').length : 0;
  const textH = lines * LINE_H;
  const signH = hasSign ? 14 : 0;
  return Math.max(minH, PAD + LBL_SZ + 6 + textH + signH + PAD);
}

export function TitleBlockLayer({ sheetConfig, onTitleBlockClick }: Props) {
  const { titleBlock, paperSize, drawingScale } = sheetConfig;

  const paperW = PAPER_SIZES_MM[paperSize].w * SHEET_PX_PER_MM;
  const paperH = PAPER_SIZES_MM[paperSize].h * SHEET_PX_PER_MM;
  const tbW    = TITLE_BLOCK_MM * SHEET_PX_PER_MM;
  const tbX    = AXIS_WIDTH + paperW;

  const [ownerStampImg, setOwnerStampImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!titleBlock.ownerStamp) { setOwnerStampImg(null); return; }
    const img = new window.Image();
    img.onload = () => setOwnerStampImg(img);
    img.src = titleBlock.ownerStamp;
  }, [titleBlock.ownerStamp]);

  const [structuralStampImg, setStructuralStampImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!titleBlock.structuralEngineerStamp) { setStructuralStampImg(null); return; }
    const img = new window.Image();
    img.onload = () => setStructuralStampImg(img);
    img.src = titleBlock.structuralEngineerStamp;
  }, [titleBlock.structuralEngineerStamp]);

  // ── Legend: unique symbols on canvas ──────────────────────────
  const elements = useCanvasStore((s) => s.elements);
  const uniqueSymbols = useMemo(() => {
    const seen = new Set<string>();
    const result: { symbolId: string; symbolName: string }[] = [];
    for (const el of elements) {
      if (!seen.has(el.symbolId)) {
        seen.add(el.symbolId);
        result.push({ symbolId: el.symbolId, symbolName: el.symbolName });
      }
    }
    return result.sort((a, b) => a.symbolName.localeCompare(b.symbolName));
  }, [elements]);

  const [legendImgs, setLegendImgs] = useState<Map<string, HTMLImageElement>>(new Map());
  const symbolKey = uniqueSymbols.map((s) => s.symbolId).join(',');
  useEffect(() => {
    if (uniqueSymbols.length === 0) { setLegendImgs(new Map()); return; }
    const map = new Map<string, HTMLImageElement>();
    let pending = uniqueSymbols.length;
    uniqueSymbols.forEach(({ symbolId }) => {
      const img = new window.Image();
      const done = () => { pending--; if (pending === 0) setLegendImgs(new Map(map)); };
      img.onload = () => { map.set(symbolId, img); done(); };
      img.onerror = done;
      img.src = symbolsApi.getImageUrl(symbolId);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolKey]);

  const LEGEND_ROW_H = 12;
  const LEGEND_HDR_H = 14;
  const LEGEND_MAX_ROWS = 10;
  const legendRows = Math.min(uniqueSymbols.length, LEGEND_MAX_ROWS);
  const legendH = uniqueSymbols.length > 0 ? LEGEND_HDR_H + legendRows * LEGEND_ROW_H + 4 : 0;

  // ── Fixed heights ──────────────────────────────────────────────
  const headerH = 34;
  const btRowH  = 20;
  const dtRowH  = 26;
  const bottomH = dtRowH + 3 * btRowH;

  // ── Natural heights per block ──────────────────────────────────
  const ownerStampExtraH      = ownerStampImg      ? 50 : 0;
  const structuralStampExtraH = structuralStampImg ? 50 : 0;
  const natOwner      = blockH(titleBlock.ownerDeveloper,     38, true) + ownerStampExtraH;
  const natStructural = blockH(titleBlock.structuralEngineer, 38, true) + structuralStampExtraH;
  const natProj       = blockH(titleBlock.projectName,        32);
  const natMain       = blockH(titleBlock.mainContractor,     32);
  const natPlumb      = blockH(titleBlock.plumbingContractor, 32);

  const available = paperH - headerH - bottomH - legendH;
  const totalNat  = natOwner + natStructural + natProj + natMain + natPlumb;

  const scale = totalNat > available ? available / totalNat : 1;
  const bonus = totalNat < available ? (available - totalNat) / 5 : 0;

  const ownerH      = Math.round(natOwner      * scale + bonus);
  const structuralH = Math.round(natStructural * scale + bonus);
  const projH       = Math.round(natProj       * scale + bonus);
  const mainH       = Math.round(natMain       * scale + bonus);
  const plumbH      = available - ownerH - structuralH - projH - mainH;

  // ── Y anchors ──────────────────────────────────────────────────
  const yOwner      = headerH;
  const yStructural = yOwner      + ownerH;
  const yProj       = yStructural + structuralH;
  const yMain       = yProj       + projH;
  const yPlumb      = yMain       + mainH;
  const yLegend     = yPlumb      + plumbH;
  const yBottom     = paperH      - bottomH;
  const yDt         = yBottom;
  const yRow1       = yDt   + dtRowH;
  const yRow2       = yRow1 + btRowH;
  const yRow3       = yRow2 + btRowH;

  // ── Bottom table column widths (3 columns) ──────────────────────
  const c1W = Math.round(tbW * 0.45);
  const c2W = Math.round(tbW * 0.28);
  const c3W = tbW - c1W - c2W;
  const bw  = 0.75;

  const BlockText = (x: number, y: number, label: string, text: string | undefined) => [
    <Text key={`lbl-${label}`} x={x + PAD} y={y + PAD}
          text={label} fontSize={LBL_SZ} fill={LBL_CLR} listening={false} />,
    <Text key={`val-${label}`}
          x={x + PAD} y={y + PAD + LBL_SZ + 4}
          width={tbW - PAD * 2}
          text={text || ''}
          fontSize={VAL_SZ} fill={VAL_CLR}
          lineHeight={1.35} wrap="word" listening={false} />,
  ];

  const renderStamp = (
    img: HTMLImageElement | null,
    extraH: number,
    blockY: number,
    bH: number,
    key: string,
  ) => {
    if (!img) return null;
    const maxW = tbW - PAD * 4;
    const maxH = Math.min(extraH - 4, bH - 40);
    if (maxH <= 0) return null;
    const s  = Math.min(maxW / img.width, maxH / img.height, 1);
    const sw = img.width  * s;
    const sh = img.height * s;
    return (
      <KonvaImage
        key={key}
        image={img}
        x={tbX + (tbW - sw) / 2}
        y={blockY + bH - extraH + (extraH - sh) / 2 - 4}
        width={sw} height={sh}
        listening={false}
      />
    );
  };

  return (
    <Layer>
      <Rect x={tbX} y={0} width={tbW} height={paperH} fill="#fff" listening={false} />
      <Line points={[tbX, 0, tbX, paperH]} stroke={BORDER} strokeWidth={1.5} listening={false} />

      {/* ═══ HEADER ══════════════════════════════════════════════ */}
      <Rect x={tbX} y={0} width={tbW} height={headerH}
            fill="#fff" stroke={BORDER} strokeWidth={bw} listening={false} />
      <Text x={tbX} y={0} width={tbW} height={headerH}
            text="SCHEMATIC DRAWING"
            fontSize={11} fontStyle="bold" fill="#111"
            align="center" verticalAlign="middle" listening={false} />

      {/* ═══ OWNER / DEVELOPER ═══════════════════════════════════ */}
      <Rect x={tbX} y={yOwner} width={tbW} height={ownerH}
            fill="#fff" stroke={BORDER} strokeWidth={bw} listening={false} />
      {BlockText(tbX, yOwner, 'OWNER / DEVELOPER :', titleBlock.ownerDeveloper)}
      {renderStamp(ownerStampImg, ownerStampExtraH, yOwner, ownerH, 'owner-stamp')}
      <Text x={tbX + PAD} y={yOwner + ownerH - 13}
            text="SIGN :" fontSize={LBL_SZ} fill={LBL_CLR} listening={false} />

      {/* ═══ STRUCTURAL ENGINEER ═════════════════════════════════ */}
      <Rect x={tbX} y={yStructural} width={tbW} height={structuralH}
            fill="#fff" stroke={BORDER} strokeWidth={bw} listening={false} />
      {BlockText(tbX, yStructural, 'STRUCTURAL ENGINEER :', titleBlock.structuralEngineer)}
      {renderStamp(structuralStampImg, structuralStampExtraH, yStructural, structuralH, 'structural-stamp')}
      <Text x={tbX + PAD} y={yStructural + structuralH - 13}
            text="SIGN :" fontSize={LBL_SZ} fill={LBL_CLR} listening={false} />

      {/* ═══ PROJECT TITLE ════════════════════════════════════════ */}
      <Rect x={tbX} y={yProj} width={tbW} height={projH}
            fill="#fff" stroke={BORDER} strokeWidth={bw} listening={false} />
      {BlockText(tbX, yProj, 'PROJECT TITLE', titleBlock.projectName)}

      {/* ═══ MAIN CON ═════════════════════════════════════════════ */}
      <Rect x={tbX} y={yMain} width={tbW} height={mainH}
            fill="#fff" stroke={BORDER} strokeWidth={bw} listening={false} />
      {BlockText(tbX, yMain, 'MAIN CON :', titleBlock.mainContractor)}

      {/* ═══ PLUMBING CONTRACTOR ══════════════════════════════════ */}
      <Rect x={tbX} y={yPlumb} width={tbW} height={plumbH}
            fill="#fff" stroke={BORDER} strokeWidth={bw} listening={false} />
      {BlockText(tbX, yPlumb, 'PLUMBING CONTRACTOR', titleBlock.plumbingContractor)}

      {/* ═══ LEGEND ══════════════════════════════════════════════ */}
      {legendH > 0 && (
        <>
          <Rect x={tbX} y={yLegend} width={tbW} height={legendH}
                fill="#f8fafc" stroke={BORDER} strokeWidth={bw} listening={false} />
          <Text x={tbX + PAD} y={yLegend + 3}
                text="LEGEND" fontSize={LBL_SZ} fontStyle="bold" fill={LBL_CLR}
                listening={false} />
          <Line points={[tbX, yLegend + LEGEND_HDR_H - 1, tbX + tbW, yLegend + LEGEND_HDR_H - 1]}
                stroke={BORDER} strokeWidth={0.5} listening={false} />
          {uniqueSymbols.slice(0, LEGEND_MAX_ROWS).map(({ symbolId, symbolName }, i) => {
            const rowY = yLegend + LEGEND_HDR_H + i * LEGEND_ROW_H;
            const img = legendImgs.get(symbolId);
            const iconSize = LEGEND_ROW_H - 2;
            return (
              <React.Fragment key={symbolId}>
                {img && (
                  <KonvaImage
                    image={img}
                    x={tbX + PAD}
                    y={rowY + 1}
                    width={iconSize}
                    height={iconSize}
                    listening={false}
                  />
                )}
                <Text
                  x={tbX + PAD + iconSize + 3}
                  y={rowY + 2}
                  text={symbolName}
                  fontSize={7}
                  fill={VAL_CLR}
                  listening={false}
                  width={tbW - PAD * 2 - iconSize - 3}
                  ellipsis
                  wrap="none"
                />
              </React.Fragment>
            );
          })}
        </>
      )}

      {/* ═══ DRAWING TITLE ════════════════════════════════════════ */}
      <Rect x={tbX} y={yDt} width={tbW} height={dtRowH}
            fill="#fff" stroke={BORDER} strokeWidth={bw} listening={false} />
      <Text x={tbX + PAD} y={yDt + 3}
            text="DRAWING TITLE" fontSize={5} fill={LBL_CLR} listening={false} />
      <Text x={tbX + PAD} y={yDt + 11}
            text="SCHEMATIC PLUMBING DRAWING"
            fontSize={6} fontStyle="bold" fill={VAL_CLR} listening={false} />

      {/* ═══ Row 1 — Drawn By | Date | Tenure of Land (spans rows 1+2) */}
      <Rect x={tbX}       y={yRow1} width={c1W} height={btRowH} fill="#fff" stroke={BORDER} strokeWidth={bw} listening={false} />
      <Text x={tbX + PAD} y={yRow1 + 2}  text="DRAWN BY"                    fontSize={5}    fill={LBL_CLR} listening={false} />
      <Text x={tbX + PAD} y={yRow1 + 10} text={titleBlock.drawnBy || '—'}   fontSize={VAL_SZ} fill={VAL_CLR} listening={false} />

      <Rect x={tbX + c1W}       y={yRow1} width={c2W} height={btRowH} fill="#fff" stroke={BORDER} strokeWidth={bw} listening={false} />
      <Text x={tbX + c1W + PAD} y={yRow1 + 2}  text="DATE"                      fontSize={5}    fill={LBL_CLR} listening={false} />
      <Text x={tbX + c1W + PAD} y={yRow1 + 10} text={titleBlock.date || '—'}    fontSize={VAL_SZ} fill={VAL_CLR} listening={false} />

      {/* Tenure of Land — spans rows 1+2 */}
      <Rect x={tbX + c1W + c2W} y={yRow1} width={c3W} height={btRowH * 2} fill="#fff" stroke={BORDER} strokeWidth={bw} listening={false} />
      <Text x={tbX + c1W + c2W + PAD} y={yRow1 + 2}  text="TENURE OF LAND"                    fontSize={5}    fill={LBL_CLR} listening={false} />
      <Text x={tbX + c1W + c2W + PAD} y={yRow1 + 10} text={titleBlock.tenureOfLand || '—'}    fontSize={VAL_SZ} fill={VAL_CLR} wrap="word" width={c3W - PAD * 2} listening={false} />

      {/* ═══ Row 2 — Checked | Scale (Tenure col already drawn above) */}
      <Rect x={tbX}       y={yRow2} width={c1W} height={btRowH} fill="#fff" stroke={BORDER} strokeWidth={bw} listening={false} />
      <Text x={tbX + PAD} y={yRow2 + 2}  text="CHECKED"                      fontSize={5}    fill={LBL_CLR} listening={false} />
      <Text x={tbX + PAD} y={yRow2 + 10} text={titleBlock.checkedBy || '—'}  fontSize={VAL_SZ} fill={VAL_CLR} listening={false} />

      <Rect x={tbX + c1W}       y={yRow2} width={c2W} height={btRowH} fill="#fff" stroke={BORDER} strokeWidth={bw} listening={false} />
      <Text x={tbX + c1W + PAD} y={yRow2 + 2}  text="SCALE"                     fontSize={5}    fill={LBL_CLR} listening={false} />
      <Text x={tbX + c1W + PAD} y={yRow2 + 10} text={`1:${drawingScale}`}        fontSize={VAL_SZ} fill={VAL_CLR} listening={false} />

      {/* ═══ Row 3 — Drawing No. | Project No. | Rev. */}
      <Rect x={tbX}       y={yRow3} width={c1W} height={btRowH} fill="#fff" stroke={BORDER} strokeWidth={bw} listening={false} />
      <Text x={tbX + PAD} y={yRow3 + 2}  text="DRAWING NO."                   fontSize={5}    fill={LBL_CLR} listening={false} />
      <Text x={tbX + PAD} y={yRow3 + 10} text={titleBlock.drawingNo || '—'}   fontSize={VAL_SZ} fill={VAL_CLR} listening={false} />

      <Rect x={tbX + c1W}       y={yRow3} width={c2W} height={btRowH} fill="#fff" stroke={BORDER} strokeWidth={bw} listening={false} />
      <Text x={tbX + c1W + PAD} y={yRow3 + 2}  text="PROJECT NO."                     fontSize={5}    fill={LBL_CLR} listening={false} />
      <Text x={tbX + c1W + PAD} y={yRow3 + 10} text={titleBlock.projectNo || '—'}     fontSize={VAL_SZ} fill={VAL_CLR} listening={false} />

      <Rect x={tbX + c1W + c2W}       y={yRow3} width={c3W} height={btRowH} fill="#fff" stroke={BORDER} strokeWidth={bw} listening={false} />
      <Text x={tbX + c1W + c2W + PAD} y={yRow3 + 2}  text="REV."                    fontSize={5}    fill={LBL_CLR} listening={false} />
      <Text x={tbX + c1W + c2W + PAD} y={yRow3 + 10} text={titleBlock.rev || '—'}   fontSize={VAL_SZ} fill={VAL_CLR} listening={false} />

      {/* ═══ Transparent click overlay — must be last (on top) ═══ */}
      {onTitleBlockClick && (
        <Rect
          x={tbX} y={0} width={tbW} height={paperH}
          fill="#ffffff" opacity={0}
          onClick={onTitleBlockClick}
          onTap={onTitleBlockClick}
          style={{ cursor: 'pointer' } as React.CSSProperties}
        />
      )}
    </Layer>
  );
}
