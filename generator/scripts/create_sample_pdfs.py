#!/usr/bin/env python3
"""Generate digital sample BOP / BOE PDFs (text layer) for gearbox OP10–60 style demo."""
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "samples"
OUT.mkdir(parents=True, exist_ok=True)

STATIONS = [
    {
        "code": "GA 10",
        "name": "GA 10 - OIL BOLT ASSEMBLY",
        "equipment": ["MACHINE GB 10", "Torque gun station fixture"],
        "ops": [
            "MOVEMENT OF WPC FROM END LIFTER TO GB 10",
            "PICK GEAR CASE RH WITHIN REACH ALIGN AND PLACE ONTO WPC",
            "PICK GEAR CASE LH WITHIN REACH ALIGN AND PLACE ONTO WPC",
            "PICK OIL BRUSH APPLY OIL TO LH AND RH SEAL CAVITY BORES",
            "PICK SCANNER SCAN LH AND RH QR CODES FOR MES",
            "OBTAIN WASHER AND BOLT PRE-ASSEMBLE TO LH GEAR CASE",
            "SECURE TORQUE GUN TIGHTEN BOLT AND RELEASE TOOL",
        ],
        "parts": ["GEAR CASING RH", "GEAR CASING LH", "BOLT HEX FLG M8", "WASHER PLN 8.4"],
    },
    {
        "code": "GA 20",
        "name": "GA 20 - RH CASE BEARING AND LH CASE OIL SEAL PRESSING",
        "equipment": ["MACHINE GB 20", "Bearing press unit"],
        "ops": [
            "MOVEMENT OF WPC FROM GB 10 TO GB 20",
            "CYLINDER PRESSES THE 1ST BEARING AND RETURNS TO HOME",
            "CYLINDER PRESSES THE 2ND BEARING AND RETURNS TO HOME",
            "CYLINDER PRESSES OIL SEAL ON LH CASE",
        ],
        "parts": ["BALL BEARING 6203", "OIL SEAL LH"],
    },
    {
        "code": "GA 30",
        "name": "GA 30 - LH CASE BEARING AND RH CASE OIL SEAL PRESSING",
        "equipment": ["MACHINE GB 30"],
        "ops": [
            "MOVEMENT OF WPC FROM GB 20 TO GB 30",
            "CYLINDER PRESSES BEARING INTO LH CASE",
            "CYLINDER PRESSES OIL SEAL ON RH CASE",
        ],
        "parts": ["BALL BEARING 6202", "OIL SEAL RH"],
    },
    {
        "code": "GA 40",
        "name": "GA 40 - DOWEL PIN GASKET AND GEARS ASSEMBLY",
        "equipment": ["MACHINE GB 40"],
        "ops": [
            "INSERT DOWEL PINS ON RH CASE",
            "PLACE GASKET ON RH CASE IN CORRECT ORIENTATION",
            "ASSEMBLE OUTPUT INTERMEDIATE AND INPUT GEARS",
        ],
        "parts": ["DOWEL PIN", "GASKET", "OUTPUT GEAR", "INTERMEDIATE GEAR", "INPUT GEAR"],
    },
    {
        "code": "GA 50",
        "name": "GA 50 - CLOSING OF LH RH GEAR CASE AND BREATHER DIAPHRAGM ASSY",
        "equipment": ["MACHINE GB 50"],
        "ops": [
            "CLOSE LH AND RH GEAR CASE",
            "ASSEMBLE BREATHER DIAPHRAGM",
            "PRE-TIGHTEN CASE BOLTS",
        ],
        "parts": ["BREATHER DIAPHRAGM", "CASE BOLTS"],
    },
    {
        "code": "GA 60",
        "name": "GA 60 - LH AND RH GEAR CASE FINAL TORQUING",
        "equipment": ["MACHINE GB 60", "Multi-spindle torque tool"],
        "ops": [
            "SECURE TORQUE GUN FINAL TIGHTEN CASE BOLTS",
            "VERIFY TORQUE OK SIGNAL TO MES",
        ],
        "parts": ["CASE BOLTS"],
    },
]


def draw_header(c: canvas.Canvas, title: str, subtitle: str):
    c.setFont("Helvetica-Bold", 14)
    c.drawString(20 * mm, 280 * mm, title)
    c.setFont("Helvetica", 9)
    c.drawString(20 * mm, 274 * mm, subtitle)
    c.line(20 * mm, 271 * mm, 190 * mm, 271 * mm)


def write_bop(path: Path):
    c = canvas.Canvas(str(path), pagesize=A4)
    draw_header(
        c,
        "BILL OF PROCESS (BOP) — Sample",
        "Transmission / Gearbox assembly — digital text PDF for PFMEA Generator demo",
    )
    y = 262 * mm
    c.setFont("Helvetica", 10)
    c.drawString(20 * mm, y, "AREA: TRANSMISSION LINE")
    y -= 6 * mm
    c.drawString(20 * mm, y, "LINE: GEAR BOX ASSEMBLY LINE")
    y -= 10 * mm

    for st in STATIONS:
        if y < 40 * mm:
            c.showPage()
            draw_header(c, "BILL OF PROCESS (BOP) — Sample (cont.)", "Gearbox assembly")
            y = 262 * mm
        c.setFont("Helvetica-Bold", 11)
        c.drawString(20 * mm, y, f"STATION: {st['name']}")
        y -= 6 * mm
        c.setFont("Helvetica", 9)
        for i, op in enumerate(st["ops"], 1):
            if y < 25 * mm:
                c.showPage()
                draw_header(c, "BILL OF PROCESS (BOP) — Sample (cont.)", "Gearbox assembly")
                y = 262 * mm
                c.setFont("Helvetica", 9)
            c.drawString(25 * mm, y, f"OP: {op}")
            y -= 5 * mm
            if i <= len(st["parts"]):
                c.setFillColorRGB(0.2, 0.2, 0.2)
                c.drawString(30 * mm, y, f"PART: {st['parts'][i - 1]}")
                c.setFillColorRGB(0, 0, 0)
                y -= 5 * mm
        y -= 4 * mm

    c.showPage()
    c.save()
    print(f"Wrote {path}")


def write_boe(path: Path):
    c = canvas.Canvas(str(path), pagesize=A4)
    draw_header(
        c,
        "BILL OF EQUIPMENT (BOE) — Sample",
        "Transmission / Gearbox assembly — machines & fixtures per station",
    )
    y = 262 * mm
    c.setFont("Helvetica", 10)
    c.drawString(20 * mm, y, "AREA: TRANSMISSION LINE")
    y -= 6 * mm
    c.drawString(20 * mm, y, "LINE: GEAR BOX ASSEMBLY LINE")
    y -= 10 * mm

    for st in STATIONS:
        c.setFont("Helvetica-Bold", 11)
        c.drawString(20 * mm, y, f"STATION: {st['name']}")
        y -= 6 * mm
        c.setFont("Helvetica", 9)
        for eq in st["equipment"]:
            c.drawString(25 * mm, y, f"EQUIPMENT: {eq}")
            y -= 5 * mm
        y -= 4 * mm

    c.showPage()
    c.save()
    print(f"Wrote {path}")


def write_combined(path: Path):
    c = canvas.Canvas(str(path), pagesize=A4)
    draw_header(
        c,
        "COMBINED BOP + BOE — Sample",
        "Single PDF with stations, equipment, and operations (OP10–60 style)",
    )
    y = 262 * mm
    c.setFont("Helvetica", 10)
    c.drawString(20 * mm, y, "AREA: TRANSMISSION LINE")
    y -= 6 * mm
    c.drawString(20 * mm, y, "LINE: GEAR BOX ASSEMBLY LINE")
    y -= 10 * mm

    for st in STATIONS:
        if y < 50 * mm:
            c.showPage()
            draw_header(c, "COMBINED BOP + BOE — Sample (cont.)", "Gearbox assembly")
            y = 262 * mm
        c.setFont("Helvetica-Bold", 11)
        c.drawString(20 * mm, y, f"STATION: {st['name']}")
        y -= 6 * mm
        c.setFont("Helvetica", 9)
        for eq in st["equipment"]:
            c.drawString(25 * mm, y, f"EQUIPMENT: {eq}")
            y -= 5 * mm
        for op in st["ops"]:
            if y < 25 * mm:
                c.showPage()
                draw_header(c, "COMBINED BOP + BOE — Sample (cont.)", "Gearbox assembly")
                y = 262 * mm
                c.setFont("Helvetica", 9)
            c.drawString(25 * mm, y, f"OP: {op}")
            y -= 5 * mm
        y -= 5 * mm

    c.showPage()
    c.save()
    print(f"Wrote {path}")


if __name__ == "__main__":
    write_bop(OUT / "sample-bop.pdf")
    write_boe(OUT / "sample-boe.pdf")
    write_combined(OUT / "sample-bop-boe-combined.pdf")
    (OUT / "README.txt").write_text(
        "Primary inputs (MVP):\n"
        "  sample-bop.pdf — Bill of Process (stations + OP lines)\n"
        "  sample-boe.pdf — Bill of Equipment (stations + EQUIPMENT lines)\n"
        "  sample-bop-boe-combined.pdf — single combined PDF\n"
        "Library:\n"
        "  failure-mode-library.xlsx — editable company library\n"
        "Optional alternate adapter:\n"
        "  demo-mpp-bop-boe.xlsx — Teamcenter MPP Excel export (same generator core)\n"
        "  blank-pfmea-template.xlsx — empty PFMEA column layout\n"
        "\nPDF limitation: digital text PDFs only. Scanned/image PDFs need OCR before upload.\n",
        encoding="utf-8",
    )
    print("Done.")
