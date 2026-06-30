import { TEMPLATES } from '../../data/templates';
import { useUiStore } from '../../store/uiStore';

interface TemplateModalProps {
  onClose: () => void;
}

export function TemplateModal({ onClose }: TemplateModalProps) {
  const setPendingTemplate = useUiStore((s) => s.setPendingTemplate);

  const applyTemplate = (templateId: string) => {
    const template = TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;
    const { elements, pipes } = template.generate();
    setPendingTemplate({ name: template.name, elements, pipes });
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff', borderRadius: 10, padding: 28,
          width: 480, maxWidth: '90vw', maxHeight: '80vh',
          boxShadow: '0 12px 48px rgba(0,0,0,0.25)',
          display: 'flex', flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#111' }}>Choose a Template</h2>
          <button
            onClick={onClose}
            style={{
              border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 20, color: '#6b7280', lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6b7280' }}>
          Templates are inserted onto your current canvas. Fill in pipe sizes,
          materials, and MRL values for each component after loading.
        </p>

        {/* Template list */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {TEMPLATES.map((template) => (
            <div
              key={template.id}
              style={{
                border: '1px solid #e5e7eb', borderRadius: 8, padding: '14px 16px',
                marginBottom: 10,
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 14, color: '#111', marginBottom: 4 }}>
                {template.name}
              </div>
              <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5, marginBottom: 12 }}>
                {template.description}
              </div>
              <button
                onClick={() => applyTemplate(template.id)}
                style={{
                  padding: '6px 16px', border: 'none', borderRadius: 5,
                  background: '#0066cc', color: '#fff', cursor: 'pointer',
                  fontSize: 13, fontWeight: 600,
                }}
              >
                Insert Template
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
