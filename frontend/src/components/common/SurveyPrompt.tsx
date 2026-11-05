/**
 * SurveyPrompt: offers the optional pilot survey when the user exports the JSON.
 *
 * Shown just before the download. Both buttons download the file, so the survey
 * never stands between the user and their export. "Take the survey" is a real
 * link opening FormSG in a new tab, so no pop-up blocker gets in the way and
 * the drawing stays open here. No data from the drawing goes to the survey.
 *
 * "Don't ask me again" is remembered in this browser (uiStore). The link is
 * PILOT_SURVEY in externalLinks.ts; setting that to null turns the prompt off.
 */
import { useEffect, useRef, useState } from 'react';
import { useUiStore } from '../../store/uiStore';

interface SurveyPromptProps {
  surveyHref: string;
  /** Start the JSON download. */
  onDownload: () => void;
  /** Close without downloading. */
  onCancel: () => void;
}

export function SurveyPrompt({ surveyHref, onDownload, onCancel }: SurveyPromptProps) {
  const dismissSurveyPrompt = useUiStore((s) => s.dismissSurveyPrompt);
  const [dontAsk, setDontAsk] = useState(false);

  // Esc cancels. The listener is added once and reads the latest onCancel from
  // a ref. Re-adding it whenever onCancel changed lost the key: the canvas's own
  // Esc handler runs first and clears the selection, React re-renders between
  // the two listeners, and a listener swapped during dispatch never fires.
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancelRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const finish = () => {
    if (dontAsk) dismissSurveyPrompt();
    onDownload();
  };

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
        role="dialog"
        aria-modal="true"
        aria-labelledby="survey-prompt-title"
        style={{
          position: 'relative', background: '#fff', borderRadius: 10, padding: 24,
          width: 440, maxWidth: 'calc(100vw - 32px)',
          boxShadow: '0 12px 48px rgba(0,0,0,0.25)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel export"
          style={{
            position: 'absolute', top: 12, right: 12, width: 28, height: 28,
            border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 20, lineHeight: 1, color: '#6b7280',
          }}
        >
          ×
        </button>

        <span style={{
          display: 'inline-block', marginBottom: 10, padding: '2px 8px', borderRadius: 10,
          background: '#e8eef5', color: '#1a3a5c',
          fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
        }}>
          Pilot
        </span>
        <h3 id="survey-prompt-title" style={{ margin: '0 0 10px', fontSize: 17, color: '#111' }}>
          Help us improve the portal
        </h3>
        <p style={{ margin: '0 0 10px', fontSize: 14, lineHeight: 1.55, color: '#374151' }}>
          Your JSON file is ready. While the portal is in its pilot phase, we would
          value your views in a short, optional survey.
        </p>
        <p style={{ margin: '0 0 16px', fontSize: 13, lineHeight: 1.5, color: '#6b7280' }}>
          The survey opens in a new tab on FormSG, the Government&apos;s form service.
          Your drawing is not sent to it.
        </p>

        <label style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20,
          fontSize: 13, color: '#374151', cursor: 'pointer', userSelect: 'none',
        }}>
          <input
            type="checkbox"
            checked={dontAsk}
            onChange={(e) => setDontAsk(e.target.checked)}
            style={{ width: 15, height: 15, cursor: 'pointer' }}
          />
          Don&apos;t ask me again on this computer
        </label>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={finish}
            style={{
              padding: '8px 16px', border: '1px solid #ccc', borderRadius: 6,
              background: '#fff', color: '#374151', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            }}
          >
            Skip and download
          </button>
          <a
            href={surveyHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={finish}
            aria-label="Take the survey and download (survey opens in a new tab)"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', border: 'none', borderRadius: 6,
              background: '#0066cc', color: '#fff', textDecoration: 'none',
              fontSize: 13, fontWeight: 600,
            }}
          >
            Take the survey and download
            <span aria-hidden="true">↗</span>
          </a>
        </div>
      </div>
    </div>
  );
}
