/**
 * Shown when Export Diagram (PDF) or Evaluate Schematic is pressed while mandatory
 * title block fields are empty (see utils/titleBlockRequirements.ts).
 *
 * The PDF is the document that gets submitted, so it is blocked until the fields are
 * filled. Evaluation is a compliance check people run while still drafting, so it only
 * warns: onContinue is passed for Evaluate and omitted for the PDF.
 */
interface MissingTitleBlockDialogProps {
  fields: string[];
  actionLabel: string;
  onFill: () => void;
  onCancel: () => void;
  onContinue?: () => void;
}

export function MissingTitleBlockDialog({ fields, actionLabel, onFill, onCancel, onContinue }: MissingTitleBlockDialogProps) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-labelledby="missing-tb-title"
        style={{
          background: '#fff', borderRadius: 10, padding: 24,
          minWidth: 340, maxWidth: 480, margin: 16,
          boxShadow: '0 12px 48px rgba(0,0,0,0.25)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="missing-tb-title" style={{ margin: '0 0 12px', fontSize: 15, color: '#b45309' }}>
          Mandatory Title Block Fields Missing
        </h3>
        <p style={{ margin: '0 0 10px', fontSize: 13, color: '#555' }}>
          {onContinue
            ? 'These title block fields are mandatory for submission and are still empty:'
            : `Fill in these title block fields before you ${actionLabel}:`}
        </p>
        <ul style={{
          background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 6,
          padding: '8px 12px 8px 28px', margin: '0 0 14px', fontSize: 12, color: '#78350f',
        }}>
          {fields.map((f) => <li key={f} style={{ padding: '2px 0' }}>{f}</li>)}
        </ul>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button onClick={onCancel} style={BTN}>Cancel</button>
          {onContinue && (
            <button onClick={onContinue} style={BTN}>{`${capitalise(actionLabel)} Anyway`}</button>
          )}
          <button onClick={onFill} style={{ ...BTN, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 600 }}>
            Open Title Block
          </button>
        </div>
      </div>
    </div>
  );
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const BTN: React.CSSProperties = {
  padding: '7px 16px', border: '1px solid #ccc', borderRadius: 5,
  background: '#fff', cursor: 'pointer', fontSize: 13,
};
