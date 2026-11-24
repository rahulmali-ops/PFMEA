# PFMEA Generator (MVP)

Generate an editable **PFMEA** from **BOP/BOE PDFs** plus your company **failure-mode library** (Excel). Export to Excel in the AE VL-style column layout.

## Flow

1. Upload **BOP PDF** + **BOE PDF** (or one combined PDF)
2. Upload / use **failure-mode library** Excel
3. Generate → review/edit rows → export PFMEA Excel

PFD generation is **skipped**. Process steps come straight from BOP/BOE so the same generator can later take Teamcenter/MPP **API** data without rewriting core logic (`ProcessInputAdapter` → `ProcessPlan`).

## Quick start

```bash
cd generator
npm install
npm run create-samples   # PDFs + library templates
npm run dev              # web :5173 + API :8787 (Ollama proxy)
```

Open http://127.0.0.1:5173 → **Load demo PDFs + library** → **Generate PFMEA**.

### Ollama (optional)

```bash
ollama serve
ollama pull llama3.2
# optional: OLLAMA_BASE_URL=http://127.0.0.1:11434 OLLAMA_MODEL=llama3.2
```

Enable **Use Ollama for AI assist** in the UI when the status pill is green.

## Sample files (`public/samples/`)

| File | Role |
| --- | --- |
| `sample-bop.pdf` | Bill of Process (STATION / OP / PART markers) |
| `sample-boe.pdf` | Bill of Equipment (STATION / EQUIPMENT) |
| `sample-bop-boe-combined.pdf` | Combined PDF |
| `failure-mode-library.xlsx` | Editable library |
| `blank-pfmea-template.xlsx` | Empty PFMEA headers |
| `demo-mpp-bop-boe.xlsx` | Optional Teamcenter MPP Excel adapter input |

## PDF notes

- Parser uses **pdf.js** text extraction (digital PDFs).
- **Scanned / image-only** PDFs need OCR first (e.g. ocrmypdf) — the UI surfaces this warning.
- Prefer the marker format in the sample PDFs: `STATION:`, `OP:`, `EQUIPMENT:`, `PART:`.

## Architecture

```
PDF | MPP Excel | (future API)
        ↓  adapters/
   ProcessPlan
        ↓  core/generator (+ library match / Ollama)
   PfmeaRow[]  →  UI edit  →  Excel export
```

Change-management stub: `src/core/changeManagement.ts`.

## Library Excel columns

`process_type`, `requirement_hint`, `failure_mode`, `failure_effect`, `severity`, `classification`, `cause`, `occurrence`, `prevention_control`, `detection_control`, `detection`, `recommended_action`, `keywords`
