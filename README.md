# PFMEA

Existing static engineering suite (HTML) plus the Phase 1 **PFMEA Generator** MVP.

## PFMEA Generator (MVP)

**Primary input: BOP/BOE PDFs** + failure-mode library Excel → generate editable PFMEA → export Excel.

```bash
cd generator
npm install
npm run create-samples
npm run dev
```

Open http://127.0.0.1:5173

Details: [generator/README.md](generator/README.md)

## Legacy static suite

Root `*.html` files are the earlier PFMEA entry / database UI (GitHub Pages workflow unchanged).
