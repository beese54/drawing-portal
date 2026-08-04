# Schematic Drawing Portal

An interactive web application for designing water pipe schematics and running rule-based compliance evaluations against Singapore's PUB water supply regulations. Every check is a deterministic Python function — no AI, no model calls, no external inference service.

![Canvas Screenshot](docs/screenshots/evaluate_tab.jpg)

---

## What it does

**Stage 1 — Draw:** Design water pipe schematics on a real-world elevation (mRL) canvas using drag-and-drop symbols. Export structured JSON metadata for downstream processing.

**Stage 2 — Evaluate:** Submit your schematic for deterministic compliance checking. The system parses the schematic JSON and runs 8 rule checks against Regulation 28, SS 636, and the PUB Handbook 2022.

> **No AI is involved.** Every compliance check is a deterministic Python
> function. The `backend/app/agents/` directory is named for historical
> reasons and contains no model calls of any kind.

---

## Key Features

| Feature | Description |
|---|---|
| Drawing Canvas | Drag-and-drop schematic editor with 70 built-in water system symbols |
| Real-world Elevation | Y-axis maps directly to mRL (metres above sea level) |
| 8 Compliance Checks | Reg 28 backflow, supply mode, MWELS water efficiency, tank/pump rules, long bath, hot water contamination, pipe materials, highest direct-supply fitting |
| Report Export | Word (.docx) compliance report, PDF drawing, and structured JSON metadata |
| Symbol Manager | Upload custom SVG/PNG symbols alongside built-in defaults (admin-key gated) |
| Docker Ready | Full multi-stage Docker build for both development (hot reload) and production (Nginx) |

---

## Screenshots

### Drawing Canvas
![Drawing Canvas](docs/screenshots/canvas_draw.jpg)

### Evaluate Schematic Tab
![Evaluate Schematic](docs/screenshots/evaluate_tab.jpg)

### Compliance Report — Reg 28 (Backflow Prevention)
![Reg 28 Backflow Prevention](docs/screenshots/compliance_reg28.jpg)

### Compliance Report — HB 2.2.1 (Mode of Supply)
![Mode of Supply](docs/screenshots/mode_of_supply.jpg)

### Compliance Report — HB 7.2.1 (WELS Water Efficiency)
![WELS Table](docs/screenshots/wels_table.jpg)

---

## Quick Start (Docker)

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running

No third-party API keys are needed — the app calls no external AI service.

### 1. Clone the repo

```bash
git clone https://github.com/your-username/schematic-drawing-portal.git
cd schematic-drawing-portal
```

### 2. Set up environment

```bash
cp backend/.env.example backend/.env
# The application has no secrets — the defaults are fine for local development.
```

### 3. Run (development — hot reload)

```bash
docker-compose up --build

# Frontend (Vite dev server):  http://localhost:5173
# Backend API:                 http://localhost:8000
# API docs (Swagger):          http://localhost:8000/docs
```

### 4. Run (production build)

```bash
docker-compose -f docker-compose.yml up --build

# Frontend (Nginx):  http://localhost:3000
# Backend API:       http://localhost:8000
```

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `SYMBOLS_PATH` | No (default: `/app/symbols`) | Path to symbols directory inside container |
| `ALLOWED_ORIGINS` | No | Comma-separated CORS origins |

### Frontend (build-time)

| Variable | Default | Description |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8000` | Backend API base URL |

> **Security:** Never commit `backend/.env` to version control. It is listed in `.gitignore`. Use the provided `backend/.env.example` as a template.

---

## Stage 1: Drawing Canvas

### mRL Configuration
- Set **Upper mRL** (max 170 m) and **Lower mRL** (min 90 m) in the right panel
- The canvas Y-axis maps to real-world elevation; the grid updates live

### Placing Symbols
- **Drag** any symbol from the palette onto the canvas
- Click a placed symbol to select it (dashed blue border)
- Drag to reposition; right-click for context options

### Drawing Pipes
1. Click **Water Pipe** in the palette to activate pipe drawing mode (header turns blue)
2. Click on canvas to set the start point
3. Click again to complete the segment — a dashed preview follows your cursor
4. Pipes chain automatically; press **Escape** to exit pipe mode

### Export Metadata
Click **Export Metadata (JSON)** to download a structured JSON file with all symbol positions, mRL elevations, and pipe segments.

### Symbol Manager
- Click **Manage Symbols** to open the manager
- Upload custom SVG/PNG symbols (max 2 MB)
- Double-click a custom symbol name to rename
- Delete custom symbols (built-in defaults are protected)

---

## Stage 2: Compliance Evaluation

### How to use
1. Draw your schematic in the **Draw Schematic** tab
2. Switch to the **Evaluate Schematic** tab
3. Complete the pre-evaluation acknowledgment checklist
4. Click **Run Compliance Evaluation**

The system exports the schematic JSON automatically, sends it to the backend, and returns the full compliance report.

### Compliance Checks

| Check | Regulation | What it verifies |
|---|---|---|
| REG28 — Backflow Prevention | Reg 28(1) | Every water heater has a check valve immediately upstream (BFS topology check) |
| SEC221 — Mode of Supply | HB 2.2.1 | Supply mode matches highest fitting elevation: ≤25 m direct, ≤37 m indirect tank, >37 m Mode C pump |
| SEC721 — Water Efficiency | HB 7.2.1 | All water fittings carry a MWELS ≥ 2-tick rating |
| TANK_PUMP — Tank & Pump | SS 636 | Overflow/warning/outlet dimensions, effective capacity vs occupancy demand, pump head ≤35 m, bypass topology |
| LONG_BATH — Long Bath | SS 636 | Capacity ≤250 L (no provisions); >250 L requires TMV, recirculation, 40 mm overflow |
| HOT_WATER — Hot Water | SS 636 §6 | Supply mode consistency, heater protection (CV+PRV), appliance double check valves, bidet spray vacuum breaker |
| SEC7_MATERIALS — Pipe Materials | SS 636 §7 | LP/PE acknowledgment that all pipes/fittings comply with SS 636 Table 1 |
| HIGHEST_FITTING — Highest Direct Supply Fitting | HB 2.2.1 | Exactly one declared highest direct-supply fitting marker with an AMSL elevation, when a direct-supply fitting is present |

Each check is a plain Python function under `backend/app/agents/` with unit
tests in `backend/tests/`. There is no model, no vector store, and no
external API call in the evaluation path.

---

## Project Structure

```
schematic-drawing-portal/
├── .gitignore
├── .env.example                      # Root env template
├── docker-compose.yml                # Production orchestration
├── docker-compose.override.yml       # Dev hot-reload overrides
├── README.md
├── start.sh / stop.sh                # Convenience scripts
│
├── backend/
│   ├── .env.example                  # API key template — copy to .env
│   ├── Dockerfile                    # Production image (Python 3.12-slim)
│   ├── Dockerfile.dev                # Dev image with --reload
│   ├── requirements.txt              # Python dependencies
│   └── app/
│       ├── main.py                   # FastAPI entry point
│       ├── config.py                 # Settings & environment
│       ├── agents/                   # Deterministic compliance-check functions (no LLM)
│       ├── routers/                  # API endpoints (evaluate, chat, symbols, health)
│       ├── models/                   # Pydantic data models
│       ├── schemas/                  # Request/response schemas
│       └── services/                 # Business logic (vector store, metrics, symbols)
│   └── symbols/
│       ├── default/                  # 64 built-in SVG water system symbols
│       ├── custom/                   # User-uploaded symbols (gitignored)
│       └── manifest.json             # Symbol registry
│
├── frontend/
│   ├── Dockerfile                    # Production (Node 20 → Nginx multi-stage)
│   ├── Dockerfile.dev                # Dev (Vite dev server)
│   ├── nginx.conf                    # Nginx reverse proxy config
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── components/
│       │   ├── canvas/               # Drawing canvas & pipe tools
│       │   ├── chat/                 # Evaluation report & chat UI
│       │   ├── panel/                # Symbol palette & settings panels
│       │   └── layout/               # App shell
│       ├── store/                    # Zustand state (canvas, chat, UI)
│       ├── hooks/                    # Custom React hooks
│       ├── types/                    # TypeScript type definitions
│       └── utils/                    # Geometry, mRL mapping, metadata builder
│
└── docs/
    ├── ARCHITECTURE.md               # Components, data flow, deployment topology
    └── screenshots/                  # UI screenshots
```

---

## Metadata Export Format

```json
{
  "schema_version": "1.0",
  "exported_at": "2026-04-01T10:30:00.000Z",
  "mrl_config": { "upper_mrl": 103, "lower_mrl": 102.5, "unit": "m", "range": 0.5 },
  "canvas": { "width_px": 1200, "height_px": 800 },
  "elements": [
    {
      "id": "el_uuid",
      "type": "symbol",
      "symbol_id": "storage_water_heater",
      "symbol_name": "Storage Water Heater",
      "position": { "canvas_x": 680, "canvas_y": 210 },
      "mrl": { "value": 102.8, "unit": "m" },
      "rotation_deg": 0,
      "fittings": [
        { "type": "shower_tap", "ticks": 2, "flow_rate": 7 }
      ]
    }
  ],
  "pipes": [
    {
      "id": "pipe_uuid",
      "type": "cold_water_pipe",
      "start": { "canvas_x": 100, "canvas_y": 165, "mrl": 103.0 },
      "end": { "canvas_x": 540, "canvas_y": 165, "mrl": 103.0 },
      "length_px": 440,
      "rotation_deg": 0
    }
  ],
  "summary": { "total_elements": 8, "total_pipes": 12, "total_pipe_length_px": 3240 }
}
```

---

## Deployment

Frontend and backend ship as a **single combined image**,
`ghcr.io/beese54/drawing-portal` — FastAPI serves the built frontend as static
files alongside the `/api/*` routes. CI builds it from the root `Dockerfile` on
every push to `main`, and GovPaaS pulls that image directly.

The service holds **no persistent state**. Nothing a user draws is stored
server-side, and the symbol library is baked into the image, so the container is
disposable and can be restarted or replaced at any time without data loss.

### Adding or changing a symbol

There is no upload API — the symbol library is read-only at runtime. To add a
symbol, commit the SVG to `backend/symbols/`, add its entry to
`backend/symbols/manifest.json`, and redeploy. This is deliberate: it keeps the
library version-controlled and reviewable, and the container filesystem is not
writable in production in any case.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Konva.js (canvas), Zustand (state), Axios |
| Backend | Python 3.12, FastAPI, Uvicorn |
| Compliance engine | Plain Python — deterministic rule functions, no AI |
| Report export | python-docx (Word), jsPDF + svg2pdf (PDF), Pillow (image annotation) |
| Containerisation | Docker, Docker Compose (local development only) |
| Hosting | GovPaaS, pulling the CI-built image from GHCR |

---

## mRL Constraints

| Setting | Hard Limit |
|---|---|
| Lower mRL | Minimum **90 m** |
| Upper mRL | Maximum **170 m** |
| Range | At least **1 m** spread required |

---

## Contributing

Pull requests are welcome. For major changes, open an issue first to discuss what you'd like to change.

---

## License

MIT
