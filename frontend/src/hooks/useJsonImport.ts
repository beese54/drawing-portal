import { useCallback, useRef } from 'react';
import { useCanvasStore } from '../store/canvasStore';
import { useUiStore } from '../store/uiStore';
import type { CanvasElement, PipeElement, TankProperties, DrawingMetadata, ExportedTankProperties } from '../types';

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

function parseSchematic(data: DrawingMetadata): { elements: CanvasElement[]; pipes: PipeElement[] } {
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
  }));

  return { elements, pipes };
}

export function useJsonImport() {
  const loadSchematic = useCanvasStore((s) => s.loadSchematic);
  const setMrlConfig = useUiStore((s) => s.setMrlConfig);
  const setTitleBlock = useUiStore((s) => s.setTitleBlock);
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
          const text = await file.text();
          const data: DrawingMetadata = JSON.parse(text);
          if (data.schema_version !== '1.0') {
            alert(`Unsupported schema version "${data.schema_version}". Only version 1.0 is supported.`);
            return;
          }
          const { elements, pipes } = parseSchematic(data);
          setMrlConfig({ lowerMrl: data.mrl_config.lower_mrl });
          if (data.title_block) setTitleBlock(data.title_block);
          loadSchematic(elements, pipes);
        } catch (err) {
          alert(`Failed to import schematic: ${err instanceof Error ? err.message : 'Invalid JSON file.'}`);
        }
      };
      fileInputRef.current = input;
    }
    fileInputRef.current.value = '';
    fileInputRef.current.click();
  }, [loadSchematic, setMrlConfig, setTitleBlock]);

  return { openFilePicker };
}
