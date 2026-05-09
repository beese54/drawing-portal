import { useState, useRef } from 'react';
import { SymbolMeta } from '../../types';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { symbolsApi } from '../../api/client';

interface SymbolManagerProps {
  symbols: SymbolMeta[];
  isLoading: boolean;
  error: string | null;
  uploadSymbol: (file: File, name: string) => Promise<void>;
  renameSymbol: (id: string, name: string) => Promise<void>;
  deleteSymbol: (id: string) => Promise<void>;
}

export function SymbolManager({ symbols, isLoading, uploadSymbol, renameSymbol, deleteSymbol }: SymbolManagerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setUploadError('File must be under 2MB');
      return;
    }
    setUploadFile(file);
    setUploadError(null);
    if (!uploadName) {
      setUploadName(file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' '));
    }
  };

  const handleUpload = async () => {
    if (!uploadFile || !uploadName.trim()) {
      setUploadError('Name and file are required');
      return;
    }
    setIsUploading(true);
    setUploadError(null);
    try {
      await uploadSymbol(uploadFile, uploadName.trim());
      setUploadFile(null);
      setUploadName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch {
      setUploadError('Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRenameConfirm = async (id: string) => {
    if (editingName.trim()) {
      await renameSymbol(id, editingName.trim());
    }
    setEditingId(null);
  };

  const handleDeleteConfirm = async () => {
    if (confirmDelete) {
      await deleteSymbol(confirmDelete);
      setConfirmDelete(null);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          width: '100%', padding: '7px 12px', border: '1px solid #ccc',
          borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 13,
          marginBottom: 8, textAlign: 'left',
        }}
      >
        Manage Symbols
      </button>
    );
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#333', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Manage Symbols
        </span>
        <button onClick={() => setIsOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#888' }}>✕</button>
      </div>

      {/* Upload form */}
      <div style={{ background: '#f7f8fa', borderRadius: 6, padding: 10, border: '1px solid #e8e8e8', marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 6 }}>Upload New Symbol</div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".svg,.png"
          onChange={handleFileChange}
          style={{ fontSize: 12, marginBottom: 6, display: 'block', width: '100%' }}
        />
        <input
          type="text"
          placeholder="Symbol name"
          value={uploadName}
          onChange={(e) => setUploadName(e.target.value)}
          style={{ width: '100%', padding: '5px 8px', border: '1px solid #ccc', borderRadius: 4, fontSize: 12, marginBottom: 6 }}
        />
        {uploadError && <div style={{ fontSize: 11, color: '#e53e3e', marginBottom: 4 }}>{uploadError}</div>}
        <button
          onClick={handleUpload}
          disabled={isUploading || !uploadFile || !uploadName.trim()}
          style={{
            width: '100%', padding: '6px', border: 'none', borderRadius: 4,
            background: '#0066cc', color: '#fff', cursor: 'pointer', fontSize: 12,
            opacity: (isUploading || !uploadFile || !uploadName.trim()) ? 0.5 : 1,
          }}
        >
          {isUploading ? 'Uploading...' : 'Upload'}
        </button>
      </div>

      {/* Symbol list */}
      <div style={{ maxHeight: 200, overflowY: 'auto' }}>
        {isLoading && <div style={{ fontSize: 12, color: '#888' }}>Loading...</div>}
        {symbols.map((sym) => (
          <div key={sym.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>
            <img src={symbolsApi.getImageUrl(sym.id)} alt={sym.name} width={24} height={24} style={{ objectFit: 'contain', flexShrink: 0 }} />
            {editingId === sym.id ? (
              <input
                autoFocus
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={() => handleRenameConfirm(sym.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleRenameConfirm(sym.id); if (e.key === 'Escape') setEditingId(null); }}
                style={{ flex: 1, padding: '2px 4px', fontSize: 12, border: '1px solid #0066cc', borderRadius: 3 }}
              />
            ) : (
              <span
                style={{ flex: 1, fontSize: 12, color: '#333', cursor: sym.category === 'custom' ? 'text' : 'default' }}
                onDoubleClick={() => { if (sym.category === 'custom') { setEditingId(sym.id); setEditingName(sym.name); } }}
                title={sym.category === 'custom' ? 'Double-click to rename' : 'Default symbol'}
              >
                {sym.name}
                {sym.category === 'default' && <span style={{ fontSize: 10, color: '#aaa', marginLeft: 4 }}>(default)</span>}
              </span>
            )}
            <button
              onClick={() => { if (sym.category !== 'default') setConfirmDelete(sym.id); }}
              disabled={sym.category === 'default'}
              title={sym.category === 'default' ? 'Cannot delete default symbols' : 'Delete'}
              style={{
                background: 'none', border: 'none', cursor: sym.category === 'default' ? 'not-allowed' : 'pointer',
                fontSize: 14, color: sym.category === 'default' ? '#ccc' : '#e53e3e', padding: '0 2px', flexShrink: 0,
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <ConfirmDialog
        isOpen={!!confirmDelete}
        title="Delete Symbol"
        message="Are you sure you want to delete this symbol? This cannot be undone."
        onConfirm={handleDeleteConfirm}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
