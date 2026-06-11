interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  children?: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ isOpen, title, message, confirmLabel = 'Delete', children, onConfirm, onCancel }: ConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: '#fff', borderRadius: 8, padding: 24, minWidth: 300, maxWidth: 400,
          boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>{title}</h3>
        <p style={{ margin: '0 0 16px', fontSize: 14, color: '#555' }}>{message}</p>
        {children && <div style={{ marginBottom: 20 }}>{children}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '7px 16px', border: '1px solid #ccc', borderRadius: 4,
              background: '#fff', cursor: 'pointer', fontSize: 13,
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '7px 16px', border: 'none', borderRadius: 4,
              background: '#e53e3e', color: '#fff', cursor: 'pointer', fontSize: 13,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
