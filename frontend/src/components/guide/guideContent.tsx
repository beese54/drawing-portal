/**
 * guideContent.tsx: the words and pictures of the in-app User Guide.
 *
 * Each section is one page of the guide. UserGuide.tsx lays them out, so
 * editing the guide means editing this file only. Button and field names are
 * wrapped in <Ui> so they match what the user sees on screen; when a label
 * changes in the app, change it here too.
 *
 * Screenshots live in frontend/public/guide/. They are taken from a local run
 * of the portal with made-up project details, never from a real submission,
 * because this repository is public.
 */
import type { ReactNode } from 'react';
import { Key, Ui } from './guideMarkup';
import { PILOT_SURVEY } from '../layout/externalLinks';

export interface GuideSection {
  id: string;
  /** Short name for the side menu. */
  navLabel: string;
  /** Shown above the title, for example "Step 2 of 6". */
  eyebrow: string;
  title: string;
  intro: ReactNode;
  image?: { src: string; alt: string; caption: string };
  /** Numbered instructions. */
  steps?: ReactNode[];
  /** Extra panels after the steps, each with a heading. */
  extras?: { heading: string; body: ReactNode }[];
  tip?: ReactNode;
}

export const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: 'overview',
    navLabel: 'Overview',
    eyebrow: 'User Guide',
    title: 'Using the WSI Schematic and Evaluation Portal',
    intro: (
      <>
        Draw a water service installation schematic, check it against PUB&apos;s
        requirements, and export the files for your submission. This guide takes
        you through it in six steps.
      </>
    ),
    extras: [
      {
        heading: 'What you can do',
        body: (
          <ul>
            <li>Set up a standard sheet with the information PUB requires</li>
            <li>Place SS CP 83 standard symbols and pipes on the sheet</li>
            <li>Find and fix the issues the portal flags</li>
            <li>Export a compliant drawing (PDF) and its data file (JSON)</li>
          </ul>
        ),
      },
      {
        heading: 'Good to know',
        body: (
          <ul>
            <li>No log-in is needed. Use Chrome or Edge.</li>
            <li>
              Your drawing is saved in this browser on this computer, not on PUB&apos;s
              servers. Clearing your browser data removes it.
            </li>
            <li>
              To keep a copy, or to carry on from another computer, use{' '}
              <Ui>Export Metadata (JSON)</Ui> and later <Ui>Import Schematic (JSON)</Ui>.
            </li>
            <li>
              Opening this guide does not affect your drawing. Click{' '}
              <Ui>Back to drawing</Ui> at the top right, or press <Key>Esc</Key>, to
              return to it.
            </li>
          </ul>
        ),
      },
    ],
  },
  {
    id: 'sheet',
    navLabel: 'Set up the sheet',
    eyebrow: 'Step 1 of 6',
    title: 'Open the portal and set up your sheet',
    intro: 'Choose the paper size, scale and base elevation before you start drawing.',
    image: {
      src: '/guide/step1-sheet.webp',
      alt: 'The Sheet tab of Sheet Setup, with paper size, drawing scale and base elevation',
      caption: 'Sheet Setup, Sheet tab',
    },
    steps: [
      <>Open the portal in Chrome or Edge. <Ui>Sheet Setup</Ui> opens on your first visit.</>,
      <>
        On the <Ui>Sheet</Ui> tab, choose the <Ui>Paper Size</Ui> from the ISO A or
        ANSI series (A3 is the usual choice) and the <Ui>Drawing Scale</Ui>, for
        example 1:50.
      </>,
      <>
        Enter the <Ui>Base Elevation (m AMSL)</Ui>: the lowest floor elevation, in
        metres above mean sea level. The Mode of Supply check uses it.
      </>,
      <>Click <Ui>Confirm</Ui>.</>,
    ],
    tip: (
      <>
        To change these later, click the <Ui>Sheet Setup</Ui> button in the right-hand
        panel. It shows the current size and scale, for example &ldquo;A3 · 1:50 · Sheet
        Setup&rdquo;.
      </>
    ),
  },
  {
    id: 'title-block',
    navLabel: 'Fill in the title block',
    eyebrow: 'Step 2 of 6',
    title: 'Fill in the title block',
    intro: 'The title block carries the project, site and applicant details printed on the sheet.',
    image: {
      src: '/guide/step2-titleblock.webp',
      alt: 'The Title Block tab of Sheet Setup, with the Submission Type and project fields',
      caption: 'Sheet Setup, Title Block tab',
    },
    steps: [
      <>
        Open the <Ui>Title Block</Ui> tab in Sheet Setup. You can also click the title
        block on the sheet to open it.
      </>,
      <>
        Choose the <Ui>Submission Type</Ui>, <Ui>PE Submission</Ui> or{' '}
        <Ui>LP Submission</Ui>, first. Fields marked * are required for that type.
      </>,
      <>
        Upload the stamp and signature for the person submitting: a PNG, JPG or WebP
        image of up to 10 MB, ideally with a transparent background. The LP stamp is
        placed on the sheet itself, so drag it into position.
      </>,
      <>Make sure the project details match your CORENET or B&amp;P submission forms.</>,
      <>Click <Ui>Confirm</Ui>.</>,
    ],
    tip: (
      <>
        Keep a high-resolution scan of your PE or LP stamp ready for electronic
        endorsement. If a required field is empty, the portal reminds you before you
        evaluate or export the PDF.
      </>
    ),
  },
  {
    id: 'templates',
    navLabel: 'Start from a template',
    eyebrow: 'Step 3 of 6',
    title: 'Start from a template',
    intro: "You don't need to start from a blank sheet. A template gives you a typical arrangement to edit.",
    image: {
      src: '/guide/step3-templates.webp',
      alt: 'The Choose a Template window listing the available templates',
      caption: 'Choose a Template',
    },
    steps: [
      <>Under <Ui>Templates</Ui> in the right-hand panel, click <Ui>Browse Templates</Ui>.</>,
      <>
        Pick a template and click <Ui>Insert Template</Ui>. There is a two-storey landed
        home, and two pump arrangements: a two-pump manifold with or without a bypass.
      </>,
      <>Move the cursor to where you want the template, then click to place it.</>,
      <>
        Add, move or delete symbols to match your design, then fill in the pipe sizes,
        materials and levels.
      </>,
    ],
    tip: 'The template is centred on your cursor. It is added to whatever is already on the sheet.',
  },
  {
    id: 'draw',
    navLabel: 'Draw the schematic',
    eyebrow: 'Step 4 of 6',
    title: 'Draw the schematic',
    intro: 'Place symbols from the palette and join them with pipes. The symbols follow SS CP 83.',
    image: {
      src: '/guide/step4-draw.webp',
      alt: 'A drawing on the sheet, with the symbol palette on the right and a warning badge on a symbol',
      caption: 'The sheet and the symbol palette',
    },
    steps: [
      <>
        Find a symbol in the palette on the right. Open a category, such as{' '}
        <Ui>Water Supply</Ui> or <Ui>Sanitary Fittings</Ui>, or type in{' '}
        <Ui>Search symbols…</Ui>.
      </>,
      <>
        Drag the symbol onto the sheet, or click it and then click where it should go.
        Press <Key>Esc</Key> to cancel.
      </>,
      <>
        Some symbols, such as pumps, first ask which way the water flows. Choose the
        direction that matches the pipes you will connect.
      </>,
      <>
        For pipes, choose <Ui>Cold Water Pipe</Ui> or <Ui>Hot Water Pipe</Ui> in the
        palette, then click a start point and an end point. Pipes run horizontally or
        vertically. Press <Key>Esc</Key> to stop.
      </>,
      <>
        Double-click a symbol to set its details, such as its water efficiency (MWELS)
        tick rating, a pump&apos;s rated head, or a dual hot and cold supply.
      </>,
    ],
    extras: [
      {
        heading: 'Moving around the sheet',
        body: (
          <ul>
            <li><Key>Ctrl</Key> + scroll wheel: zoom in and out</li>
            <li>Scroll wheel: scroll up and down (add <Key>Shift</Key> to scroll sideways)</li>
            <li>Hold the scroll wheel and drag: move the sheet</li>
            <li>Double-click the scroll wheel: fit the whole sheet on screen</li>
            <li>
              <Key>Ctrl</Key> + <Key>Z</Key> undo, <Key>Ctrl</Key> + <Key>Y</Key> redo,{' '}
              <Key>Delete</Key> remove what is selected
            </li>
          </ul>
        ),
      },
      {
        heading: 'Issues on the sheet',
        body: (
          <ul>
            <li>
              <span className="guide-badge guide-badge-warn" aria-hidden="true">!</span>{' '}
              Orange <strong>!</strong>: something is missing or needs checking. Point at it
              to see what, and click it to fix it where that is offered.
            </li>
            <li>
              <span className="guide-badge guide-badge-port" aria-hidden="true">✕</span>{' '}
              Red <strong>✕</strong>: a connection point with no pipe connected yet.
            </li>
            <li>Both glow softly until they are fixed.</li>
          </ul>
        ),
      },
    ],
    tip: 'Check that each flow direction matches the connections you draw. Several checks depend on it.',
  },
  {
    id: 'evaluate',
    navLabel: 'Evaluate',
    eyebrow: 'Step 5 of 6',
    title: 'Evaluate the schematic',
    intro: 'Check the drawing against PUB requirements at any point while you draw.',
    image: {
      src: '/guide/step5-evaluate.webp',
      alt: 'The WSI Compliance Evaluation results, with failed and passed checks and the Export to Word button',
      caption: 'Evaluation results',
    },
    steps: [
      <>Click <Ui>Evaluate Schematic</Ui> in the right-hand panel.</>,
      <>
        If required title block fields are empty, the portal lists them. Fill them in,
        or continue the evaluation without them for now.
      </>,
      <>
        In the <Ui>Pre-Evaluation Checklist</Ui>, tick the statements that apply, then
        click <Ui>Confirm &amp; Evaluate</Ui>. They cover issues PUB commonly finds,
        such as using PUB-approved materials and not placing tanks or pumps below
        sanitary pipes. Only the ones relevant to your drawing are shown, and some are
        optional.
      </>,
      <>
        Read the summary of results. Click <Ui>Export to Word</Ui> for a report listing
        each non-compliant item with a picture of where it is on the drawing.
      </>,
    ],
    tip: 'Evaluate often, so you can fix issues while they are still small.',
  },
  {
    id: 'export',
    navLabel: 'Export',
    eyebrow: 'Step 6 of 6',
    title: 'Export your drawing',
    intro: 'Export the drawing as a PDF and its data as a JSON file. Submit both to PUB.',
    image: {
      src: '/guide/step6-export.webp',
      alt: 'The Evaluate, Import, Export Metadata (JSON), Export Diagram (PDF) and Clear Canvas buttons',
      caption: 'The export buttons',
    },
    steps: [
      <>
        Click <Ui>Export Diagram (PDF)</Ui> to download the drawing. Required title
        block fields must be filled in first.
      </>,
      <>
        Click <Ui>Export Metadata (JSON)</Ui> to download the drawing&apos;s data. If any
        connection point has no pipe, the portal lists them first: fix them, or click{' '}
        <Ui>Export Anyway</Ui>.
      </>,
      // Only while the survey prompt is switched on (PILOT_SURVEY).
      ...(PILOT_SURVEY ? [
        <>
          During the pilot, a short optional survey is offered before the JSON
          downloads. Choose <Ui>Take the survey and download</Ui> to open it in a new
          tab, or <Ui>Skip and download</Ui>. Either way, your file downloads.
        </>,
      ] : []),
      <>Submit the PDF and the JSON file together. PUB checks the JSON alongside the drawing.</>,
    ],
    tip: (
      <>
        To continue later or on another computer, click <Ui>Import Schematic (JSON)</Ui>{' '}
        and choose the JSON file you exported.
      </>
    ),
  },
  {
    id: 'feedback',
    navLabel: 'Feedback',
    eyebrow: 'Pilot',
    title: 'Tell us what you think',
    intro: (
      <>
        The portal is in its pilot phase, and your feedback shapes what comes next. Use
        the <Ui>Feedback</Ui> link at the bottom of the page.
      </>
    ),
    extras: [
      {
        heading: 'Reporting a problem',
        body: (
          <p>
            Say which step you were on, what you expected, and what happened instead. A
            screenshot or the exported file helps.
          </p>
        ),
      },
      {
        heading: 'Ideas we would like to hear',
        body: (
          <ul>
            <li><strong>New features:</strong> what would make your work easier, and how you would use it</li>
            <li><strong>Rules:</strong> checks to add to the evaluation, with an example of when each applies</li>
            <li><strong>Symbols:</strong> symbols that are missing, including any you would propose for the next SS CP 83 revision</li>
          </ul>
        ),
      },
    ],
  },
];
