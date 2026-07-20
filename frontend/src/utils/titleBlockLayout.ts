import { TITLE_BLOCK_MM, SHEET_PX_PER_MM, PAPER_SIZES_MM, AXIS_WIDTH } from '../types';
import type { SheetConfig } from '../types';

// Shared title-block visual constants — single source of truth for both the Konva
// screen renderer (TitleBlockLayer.tsx) and the PDF vector exporter.
export const BORDER  = '#2a2a2a';
export const LBL_CLR = '#555';
export const VAL_CLR = '#111';
export const LBL_SZ  = 5.5;
export const VAL_SZ  = 6.5;
export const LINE_H  = 8.5;
export const PAD     = 6;

export const LEGEND_ROW_H = 12;
export const LEGEND_HDR_H = 14;
export const LEGEND_MAX_ROWS = 10;

export function blockH(text: string | undefined, minH: number, hasSign = false): number {
  const lines = text?.trim() ? text.split('\n').length : 0;
  const textH = lines * LINE_H;
  const signH = hasSign ? 14 : 0;
  return Math.max(minH, PAD + LBL_SZ + 6 + textH + signH + PAD);
}

export interface TitleBlockLayout {
  paperW: number;
  paperH: number;
  tbW: number;
  tbX: number;
  headerH: number;
  ownerStampExtraH: number;
  structuralStampExtraH: number;
  ownerH: number;
  structuralH: number;
  projH: number;
  mainH: number;
  plumbH: number;
  yOwner: number;
  yStructural: number;
  yProj: number;
  yMain: number;
  yPlumb: number;
  legendCols: number;
  legendRows: number;
  legendH: number;
  yLegend: number;
  bottomH: number;
  btRowH: number;
  dtRowH: number;
  yDt: number;
  yRow1: number;
  yRow2: number;
  yRow3: number;
  c1W: number;
  c2W: number;
  c3W: number;
  borderWidth: number;
}

/**
 * Pure layout math for the title block — every position/size needed to draw it.
 * Takes only plain data (no loaded Image objects) so it can be called identically
 * from the Konva screen renderer and the PDF vector exporter.
 */
export function computeTitleBlockLayout(
  sheetConfig: SheetConfig,
  legendSymbolCount: number,
  hasOwnerStamp: boolean,
  hasStructuralStamp: boolean,
): TitleBlockLayout {
  const { titleBlock, paperSize } = sheetConfig;

  const paperW = PAPER_SIZES_MM[paperSize].w * SHEET_PX_PER_MM;
  const paperH = PAPER_SIZES_MM[paperSize].h * SHEET_PX_PER_MM;
  const tbW    = TITLE_BLOCK_MM * SHEET_PX_PER_MM;
  const tbX    = AXIS_WIDTH + paperW;

  const legendCols = legendSymbolCount > 20 ? 3 : 2;
  const legendRows = Math.min(Math.ceil(legendSymbolCount / legendCols), LEGEND_MAX_ROWS);
  const legendH = legendSymbolCount > 0 ? LEGEND_HDR_H + legendRows * LEGEND_ROW_H + 4 : 0;

  const headerH = 34;
  const btRowH  = 20;
  const dtRowH  = 26;
  const bottomH = dtRowH + 3 * btRowH;

  const ownerStampExtraH      = hasOwnerStamp      ? 50 : 0;
  const structuralStampExtraH = hasStructuralStamp ? 50 : 0;
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

  const c1W = Math.round(tbW * 0.45);
  const c2W = Math.round(tbW * 0.28);
  const c3W = tbW - c1W - c2W;

  return {
    paperW, paperH, tbW, tbX, headerH,
    ownerStampExtraH, structuralStampExtraH,
    ownerH, structuralH, projH, mainH, plumbH,
    yOwner, yStructural, yProj, yMain, yPlumb,
    legendCols, legendRows, legendH, yLegend,
    bottomH, btRowH, dtRowH, yDt, yRow1, yRow2, yRow3,
    c1W, c2W, c3W,
    borderWidth: 0.75,
  };
}
