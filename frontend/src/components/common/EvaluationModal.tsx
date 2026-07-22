import { useState } from 'react';
import type { EvaluationResponse } from '../../types/evaluation';
import type { DrawingMetadata } from '../../types';
import { EvaluationReport } from '../chat/EvaluationReport';
import { useUiStore } from '../../store/uiStore';
import { exportApi } from '../../api/client';
import { getOrderedChecks, ISSUE_STATUS_PRIORITY } from '../../utils/evaluationOrder';
import { computeCropRegion } from '../../utils/issueCropRegions';

interface Props {
  result: EvaluationResponse;
  metadata: DrawingMetadata;
  onClose: () => void;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/data:(.*?);/)?.[1] || 'image/jpeg';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// Output pixel size a crop is allowed to grow to before we start dialing the
// pixelRatio back down — keeps a handful of widely-spread multi-element
// issues from producing enormous images, while small single-symbol crops
// still get the full high pixelRatio for crispness.
const MAX_CROP_OUTPUT_PX = 1600;
const MAX_PIXEL_RATIO = 12;
const MIN_PIXEL_RATIO = 3;

export function EvaluationModal({ result, metadata, onClose }: Props) {
  const captureStageRegionFn = useUiStore((s) => s.captureStageRegionFn);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExportDocx = async () => {
    setExportError(null);
    setExporting(true);
    try {
      const crops: Blob[] = [];
      const rows: Array<{
        check_id: string;
        check_title: string;
        status: string;
        text: string;
        crop_index: number | null;
      }> = [];

      for (const check of getOrderedChecks(result)) {
        const flagged = (check.issues || [])
          .filter((issue) => issue.status in ISSUE_STATUS_PRIORITY)
          .sort((a, b) => ISSUE_STATUS_PRIORITY[a.status] - ISSUE_STATUS_PRIORITY[b.status]);

        for (const issue of flagged) {
          let cropIndex: number | null = null;
          const region = computeCropRegion(issue.element_ids, metadata.elements, metadata.pipes);
          if (region && captureStageRegionFn) {
            const pixelRatio = Math.max(
              MIN_PIXEL_RATIO,
              Math.min(MAX_PIXEL_RATIO, MAX_CROP_OUTPUT_PX / Math.max(region.width, region.height, 1)),
            );
            try {
              // Konva fully re-renders the scene (translated) for every capture, not a
              // cheap sub-rectangle read — a region far from the origin on a large sheet
              // at a high pixelRatio can exceed the browser's canvas size limit and throw.
              // One bad crop shouldn't sink the whole export, so this row just falls back
              // to a blank cell (same as an issue with no location) rather than aborting.
              const dataUrl = captureStageRegionFn(region, pixelRatio);
              if (dataUrl) {
                crops.push(dataUrlToBlob(dataUrl));
                cropIndex = crops.length - 1;
              }
            } catch (err) {
              console.warn(`Crop capture failed for ${check.check_id} issue "${issue.text}":`, err);
            }
          }
          rows.push({
            check_id: check.check_id,
            check_title: check.title,
            status: issue.status,
            text: issue.text,
            crop_index: cropIndex,
          });
          // Yield to the browser between captures — each one is a full scene re-render,
          // so a schematic with many flagged issues would otherwise freeze the tab for
          // the whole loop before the download starts.
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      const formData = new FormData();
      formData.append('manifest_json', JSON.stringify(rows));
      crops.forEach((blob, i) => formData.append('crops', blob, `crop_${i}.jpg`));

      const docxBlob = await exportApi.exportDocx(formData);
      const url = URL.createObjectURL(docxBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `compliance_report_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#0f172a',
          borderRadius: 12,
          width: 'min(720px, calc(100vw - 32px))',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 16px 64px rgba(0,0,0,0.5)',
          border: '1px solid #1e293b',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid #1e293b',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>
              WSI Compliance Evaluation
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
              PUB WSI Checklist (Landed) · Sections 3 – 7
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={handleExportDocx}
              disabled={exporting}
              title="Export a Word document listing every non-compliant item with a cropped image of its location, for officers to annotate with remarks."
              style={{
                background: exporting ? '#1e293b' : '#2563eb',
                border: 'none',
                borderRadius: 6,
                color: '#fff',
                cursor: exporting ? 'not-allowed' : 'pointer',
                fontSize: 13,
                fontWeight: 600,
                padding: '5px 12px',
              }}
            >
              {exporting ? 'Exporting…' : 'Export to Word'}
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: '1px solid #334155',
                borderRadius: 6,
                color: '#94a3b8',
                cursor: 'pointer',
                fontSize: 13,
                padding: '4px 12px',
              }}
            >
              Close
            </button>
          </div>
        </div>

        {exportError && (
          <div style={{ padding: '0 20px 8px', fontSize: 12, color: '#f87171' }}>
            {exportError}
          </div>
        )}

        {/* Scrollable results */}
        <div style={{ overflowY: 'auto', padding: '4px 20px 20px', flex: 1 }}>
          <EvaluationReport result={result} />
        </div>
      </div>
    </div>
  );
}
