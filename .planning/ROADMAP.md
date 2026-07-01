# Roadmap: Schematic Drawing Portal — v1.0 POC Polish & Feature Fixes

## Overview

This milestone tightens the POC for LP/PE engineer review. Work falls into four natural delivery areas: making templates user-configurable via JSON, fixing annotation sizing and adding resize controls, normalising tee junction and elbow bend visual dimensions, and finally sweeping for dead code once the feature work is stable.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: JSON-Driven Templates** - User can load new templates by supplying JSON, without code changes
- [ ] **Phase 2: Annotation Fixes & Resize** - Annotation boxes match size across edit/display modes and support horizontal and vertical resize
- [ ] **Phase 3: Symbol Size Normalisation** - Tee junction and elbow bend render at equivalent visual dimensions
- [ ] **Phase 4: Codebase Audit** - Dead files, orphaned imports, and unused modules removed

## Phase Details

### Phase 1: JSON-Driven Templates
**Goal**: Users can extend the template library by providing a JSON file — no code changes required
**Depends on**: Nothing (first phase)
**Requirements**: TMPL-01, TMPL-02
**Success Criteria** (what must be TRUE):
  1. User can supply a JSON file describing one or more templates and they appear in the Browse Templates panel without editing source code
  2. Templates added via JSON are selectable and insertable alongside the five existing built-in compliance block templates
  3. Added templates survive a page reload (they persist, not just appear once)
**Plans**: TBD

### Phase 2: Annotation Fixes & Resize
**Goal**: Annotation boxes behave consistently between display and edit modes, and users can resize them in both dimensions
**Depends on**: Nothing (can run in parallel with Phase 1)
**Requirements**: ANNO-01, ANNO-02, ANNO-03
**Success Criteria** (what must be TRUE):
  1. Double-clicking an annotation to edit does not cause the box to jump to a different size or position — edit mode and display mode look identical in dimensions
  2. User can drag a horizontal resize handle (or use an input control) to widen or narrow an annotation box
  3. User can drag a vertical resize handle (or use an input control) to increase or decrease the height of an annotation box
  4. Width and height changes persist when the user closes edit mode and remain after saving/exporting
**Plans**: 2 plans
Plans:
- [x] 02-01-PLAN.md — Add `height` field to AnnotationElement type and store actions (updateAnnotationSize, resizeAnnotation) with persist migration
- [x] 02-02-PLAN.md — Wire height sync and resize handles in AnnotationNode; fix textarea width/height/color in DrawingCanvas
**UI hint**: yes

### Phase 3: Symbol Size Normalisation
**Goal**: Tee junction and elbow bend symbols are visually equivalent in size so pipe connections align predictably
**Depends on**: Nothing (can run in parallel with Phases 1–2)
**Requirements**: SYM-01
**Success Criteria** (what must be TRUE):
  1. A tee junction and an elbow bend placed side-by-side on the canvas occupy the same bounding box width and height
  2. Port positions on both symbols align with pipes drawn at the same grid coordinates — no offset or overlap mismatch between the two symbol types
**Plans**: TBD
**UI hint**: yes

### Phase 4: Codebase Audit
**Goal**: The codebase contains no dead files, orphaned imports, or unused modules that accumulated during POC development
**Depends on**: Phase 1, Phase 2, Phase 3
**Requirements**: CODE-01
**Success Criteria** (what must be TRUE):
  1. The legacy `water_fittings` dialog component is either removed (if confirmed unused) or explicitly retained with a rationale comment — no ambiguous orphan
  2. No TypeScript import in the frontend references a file or export that does not exist
  3. Running the application after the audit produces no console errors related to missing modules or undefined references
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 (Phases 1–3 are independent and may be planned/executed in any order; Phase 4 depends on all three)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. JSON-Driven Templates | 0/TBD | Not started | - |
| 2. Annotation Fixes & Resize | 2/2 | Awaiting human verify (checkpoint) | - |
| 3. Symbol Size Normalisation | 0/TBD | Not started | - |
| 4. Codebase Audit | 0/TBD | Not started | - |
