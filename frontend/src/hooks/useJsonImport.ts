import { useCallback, useRef } from 'react';
import { useCanvasStore } from '../store/canvasStore';
import { useUiStore } from '../store/uiStore';
import { DEFAULT_SHEET_CONFIG } from '../types';
import type { CanvasElement, PipeElement, AnnotationElement, TankProperties, DrawingMetadata, ExportedTankProperties, TitleBlockData } from '../types';
import {
  HEX_COLOR_RE,
  MAX_IMPORT_FILE_BYTES,
  SchematicImportError,
  reencodeTitleBlockStamps,
  safeHexColor,
  safeText,
  sanitizeTitleBlock,
  validateSchematicShape,
} from '../utils/importValidation';

/** What new annotations are created with — see DrawingCanvas.tsx:1139. */
const DEFAULT_ANNOTATION_COLOR = '#1a1a1a';

// HEX_COLOR_RE matches SymbolNode.tsx's hexToRgb validation. Guarding this at the import
// boundary matters more than it looks: jsPDF's setDrawColor/setTextColor/encodeColorString
// THROWS on a color string that isn't #rrggbb, a recognized CSS name, or numeric — an
// unvalidated color from a hand-edited or corrupted schematic JSON wouldn't just render
// wrong on canvas (browsers silently ignore bad CSS colors), it would crash the entire PDF
// export the moment drawPipes() or the annotation pass reaches it, for a reason with no
// obvious link back to "the import." Malformed values are dropped here instead.
//
// The same guard now applies to BOTH pipe custom_color and annotation color. It was
// originally added for pipes only, which left pdfVectorExport's setTextColor(ann.color)
// exposed to exactly the failure the comment above describes.
//
// See utils/importValidation.ts for the rest of the import boundary — in particular the
// title-block stamp fields, which are assigned to img.src and must be data-URLs.

function importTankProperties(tp: ExportedTankProperties): TankProperties {
  const num = (v: number | null): number | undefined => (v !== null ? v : undefined);
  return {
    ...(tp.material !== null && { material: tp.material }),
    ...(tp.is_sunken_tank !== null && { isSunkenTank: tp.is_sunken_tank }),
    ...(tp.length_m !== null && { lengthM: num(tp.length_m) }),
    ...(tp.width_m !== null && { widthM: num(tp.width_m) }),
    ...(tp.height_m !== null && { heightM: num(tp.height_m) }),
    ...(tp.floor_level_m_amsl !== null && { floorLevelMAmsl: num(tp.floor_level_m_amsl) }),
    ...(tp.inlet_pipe_diameter_m !== null && { inletPipeDiameterM: num(tp.inlet_pipe_diameter_m) }),
    ...(tp.inlet_pipe_m_amsl !== null && { inletPipeMAmsl: num(tp.inlet_pipe_m_amsl) }),
    ...(tp.outlet_pipe_diameter_m !== null && { outletPipeDiameterM: num(tp.outlet_pipe_diameter_m) }),
    ...(tp.distance_outlet_to_base_m !== null && { distanceOutletToBaseM: num(tp.distance_outlet_to_base_m) }),
    ...(tp.overflow_pipe_diameter_m !== null && { overflowPipeDiameterM: num(tp.overflow_pipe_diameter_m) }),
    ...(tp.overflow_pipe_m_amsl !== null && { overflowPipeMAmsl: num(tp.overflow_pipe_m_amsl) }),
    ...(tp.warning_pipe_diameter_m !== null && { warningPipeDiameterM: num(tp.warning_pipe_diameter_m) }),
    ...(tp.warning_pipe_m_amsl !== null && { warningPipeMAmsl: num(tp.warning_pipe_m_amsl) }),
    ...(tp.support_height_m !== null && { supportHeightM: num(tp.support_height_m) }),
    ...(tp.occupants !== null && { occupants: tp.occupants ?? undefined }),
  };
}

function parseSchematic(data: DrawingMetadata): { elements: CanvasElement[]; pipes: PipeElement[]; annotations: AnnotationElement[] } {
  const elements: CanvasElement[] = data.elements.map((el) => {
    const base: CanvasElement = {
      id: el.id,
      symbolId: el.symbol_id,
      symbolName: el.symbol_name,
      x: el.position.canvas_x,
      y: el.position.canvas_y,
      width: el.width,
      height: el.height,
      rotation: el.rotation_deg,
      ...(el.scale_x !== 1 && { scaleX: el.scale_x }),
      ...(el.fitting_type !== undefined && { fittingType: el.fitting_type }),
      ...(el.efficiency_rating !== undefined && { efficiencyRating: el.efficiency_rating }),
      ...(el.long_bath_capacity_l != null && { longBathCapacityL: el.long_bath_capacity_l }),
      ...(el.tank_properties !== undefined && { tankProperties: importTankProperties(el.tank_properties) }),
      ...(el.upstream_port_indices !== undefined && { upstreamPortIndices: el.upstream_port_indices }),
      ...(el.upstream_port_index   !== undefined && el.upstream_port_indices === undefined && { upstreamPortIndex: el.upstream_port_index }),
      ...(el.dual_supply !== undefined && { dualSupply: el.dual_supply }),
      ...(el.swap_dual_supply !== undefined && { swapDualSupply: el.swap_dual_supply }),
      ...(el.pump_rated_head_m != null && { pumpRatedHeadM: el.pump_rated_head_m }),
      ...(el.highest_fitting_elevation_m != null && { highestFittingElevationM: el.highest_fitting_elevation_m }),
    };
    return base;
  });

  const pipes: PipeElement[] = data.pipes.map((p) => ({
    id: p.id,
    pipeType: p.pipe_type,
    startX: p.start.canvas_x,
    startY: p.start.canvas_y,
    endX: p.end.canvas_x,
    endY: p.end.canvas_y,
    ...(p.custom_color !== undefined && HEX_COLOR_RE.test(p.custom_color) && { customColor: p.custom_color }),
    ...(p.diameter_label !== undefined && { diameterLabel: p.diameter_label }),
  }));

  const annotations: AnnotationElement[] = (data.annotations ?? []).map((ann) => ({
    id: ann.id,
    x: ann.position.canvas_x,
    y: ann.position.canvas_y,
    text: safeText(ann.text) ?? '',
    fontSize: ann.font_size,
    // Same guard as the pipes above — pdfVectorExport:setTextColor is fed this value.
    // Falls back to the colour new annotations are created with (DrawingCanvas.tsx:1139).
    color: safeHexColor(ann.color) ?? DEFAULT_ANNOTATION_COLOR,
    maxWidth: ann.max_width,
    height: ann.height,
  }));

  return { elements, pipes, annotations };
}

export function useJsonImport() {
  const loadSchematic = useCanvasStore((s) => s.loadSchematic);
  const setMrlConfig = useUiStore((s) => s.setMrlConfig);
  const setTitleBlock = useUiStore((s) => s.setTitleBlock);
  const setSheetConfig = useUiStore((s) => s.setSheetConfig);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const openFilePicker = useCallback(() => {
    if (!fileInputRef.current) {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        try {
          // Check the size before reading — file.text() on a multi-gigabyte file
          // buffers the whole thing into memory before anything can reject it.
          if (file.size > MAX_IMPORT_FILE_BYTES) {
            throw new SchematicImportError(
              `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB, over the `
              + `${MAX_IMPORT_FILE_BYTES / 1024 / 1024} MB limit for a schematic.`,
            );
          }
          const text = await file.text();
          const parsed: unknown = JSON.parse(text);
          // Runtime check first: the cast below is erased at compile time and proves
          // nothing about a file written by someone else.
          validateSchematicShape(parsed);
          const data = parsed as DrawingMetadata;
          const { elements, pipes, annotations } = parseSchematic(data);
          // setSheetConfig must run before setMrlConfig — setMrlConfig derives
          // upperMrl from whatever sheetConfig (paper size/drawing scale) is
          // current at call time, so applying the imported sheet_config first
          // ensures the restored lowerMrl is interpreted against the same
          // scale it was exported with, not the importing session's own.
          // Never pass data.title_block through unfiltered: its three stamp fields are
          // assigned to img.src downstream. Three layers, in order of what each stops:
          //   sanitizeTitleBlock  — data:-URL only, so a stamp can never reach the network,
          //                         and the signature bytes must match the declared format
          //   reencodeTitleBlockStamps — redraws each stamp through a canvas, so only
          //                         decoded pixels survive and anything appended is lost
          //   Content-Security-Policy img-src (backend main.py) — enforces the first layer
          //                         in the browser even if this code regresses later
          const sanitized = sanitizeTitleBlock(data.title_block);
          const titleBlock = (sanitized
            ? await reencodeTitleBlockStamps(sanitized)
            : undefined) as TitleBlockData | undefined;
          if (data.sheet_config) {
            setSheetConfig({
              paperSize: data.sheet_config.paper_size,
              drawingScale: data.sheet_config.drawing_scale,
              titleBlock: titleBlock ?? DEFAULT_SHEET_CONFIG.titleBlock,
            });
          } else if (titleBlock) {
            // Backward-compat: files exported before sheet_config existed.
            setTitleBlock(titleBlock);
          }
          setMrlConfig({ lowerMrl: data.mrl_config.lower_mrl });
          loadSchematic(elements, pipes, annotations);
        } catch (err) {
          // A structural problem gets its own specific message; anything else is a
          // malformed file and the parser's own wording is the most useful thing to show.
          alert(
            err instanceof SchematicImportError
              ? err.message
              : `Failed to import schematic: ${err instanceof Error ? err.message : 'Invalid JSON file.'}`,
          );
        }
      };
      fileInputRef.current = input;
    }
    fileInputRef.current.value = '';
    fileInputRef.current.click();
  }, [loadSchematic, setMrlConfig, setTitleBlock, setSheetConfig]);

  return { openFilePicker };
}
