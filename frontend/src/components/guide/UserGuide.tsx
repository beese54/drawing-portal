/**
 * UserGuide: the in-app User Guide, opened from the header.
 *
 * It covers the canvas and the tool panel instead of replacing them. Both stay
 * mounted underneath, so the drawing, the zoom and the selection are exactly as
 * the user left them when they go back, and the canvas never sees a resize.
 * DrawingCanvas ignores its keyboard shortcuts while the guide is open.
 *
 * One section shows at a time: a side menu to jump between them, and
 * Previous/Next at the bottom. The words and pictures are in guideContent.tsx.
 * The guide is part of the portal (same origin, same release and the same
 * security scans) rather than a separate website.
 */
import { useEffect, useRef, useState } from 'react';
import { useUiStore } from '../../store/uiStore';
import { GUIDE_SECTIONS, type GuideSection } from './guideContent';

export function UserGuide() {
  const setGuideOpen = useUiStore((s) => s.setGuideOpen);
  const [index, setIndex] = useState(0);
  const mainRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const section = GUIDE_SECTIONS[index];

  // Esc goes back to the drawing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setGuideOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setGuideOpen]);

  // A new section starts at the top, with focus on its heading so screen
  // readers announce it. Not on first open: focus stays on the header button.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    mainRef.current?.scrollTo({ top: 0 });
    headingRef.current?.focus();
  }, [index]);

  const prev = GUIDE_SECTIONS[index - 1];
  const next = GUIDE_SECTIONS[index + 1];

  return (
    <div className="guide" role="region" aria-label="User Guide">
      <nav className="guide-nav" aria-label="User Guide sections">
        <div className="guide-nav-title">User Guide</div>
        <ol>
          {GUIDE_SECTIONS.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                className="guide-nav-item"
                aria-current={i === index ? 'page' : undefined}
                onClick={() => setIndex(i)}
              >
                <span className="guide-nav-num" aria-hidden="true">
                  {s.eyebrow.startsWith('Step') ? s.eyebrow.split(' ')[1] : '•'}
                </span>
                {s.navLabel}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div className="guide-main" ref={mainRef}>
        <article className="guide-article">
          <Section section={section} headingRef={headingRef} />

          <div className="guide-pager">
            {prev ? (
              <button type="button" className="guide-pager-btn" onClick={() => setIndex(index - 1)}>
                <span className="guide-pager-dir">← Previous</span>
                {prev.navLabel}
              </button>
            ) : <span />}
            {next ? (
              <button type="button" className="guide-pager-btn guide-pager-next" onClick={() => setIndex(index + 1)}>
                <span className="guide-pager-dir">Next →</span>
                {next.navLabel}
              </button>
            ) : (
              <button type="button" className="guide-pager-btn guide-pager-next" onClick={() => setGuideOpen(false)}>
                <span className="guide-pager-dir">Done</span>
                Back to drawing
              </button>
            )}
          </div>
        </article>
      </div>
    </div>
  );
}

function Section({ section, headingRef }: { section: GuideSection; headingRef: React.Ref<HTMLHeadingElement> }) {
  return (
    <>
      <div className="guide-eyebrow">{section.eyebrow}</div>
      <h1 className="guide-title" ref={headingRef} tabIndex={-1}>{section.title}</h1>
      <p className="guide-intro">{section.intro}</p>

      {section.image && (
        <figure className="guide-figure">
          <img src={section.image.src} alt={section.image.alt} loading="lazy" />
          <figcaption>{section.image.caption}</figcaption>
        </figure>
      )}

      {section.steps && (
        <ol className="guide-steps">
          {section.steps.map((step, i) => <li key={i}>{step}</li>)}
        </ol>
      )}

      {section.extras?.map((extra) => (
        <section className="guide-panel" key={extra.heading}>
          <h2>{extra.heading}</h2>
          {extra.body}
        </section>
      ))}

      {section.tip && (
        <aside className="guide-tip">
          <strong>Tip</strong>
          <span>{section.tip}</span>
        </aside>
      )}
    </>
  );
}
