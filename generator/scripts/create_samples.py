#!/usr/bin/env python3
"""Create sample failure-mode library + copy/convert demo MPP workbook."""
from pathlib import Path
import shutil

try:
    import openpyxl
except ImportError:
    import subprocess, sys
    subprocess.check_call([sys.executable, "-m", "pip", "install", "openpyxl", "-q"])
    import openpyxl

ROOT = Path(__file__).resolve().parents[1]
SAMPLES = ROOT / "public" / "samples"
SAMPLES.mkdir(parents=True, exist_ok=True)

# --- Failure mode library ---
lib = openpyxl.Workbook()
ws = lib.active
ws.title = "Failure Mode Library"
headers = [
    "process_type",
    "requirement_hint",
    "failure_mode",
    "failure_effect",
    "severity",
    "classification",
    "cause",
    "occurrence",
    "prevention_control",
    "detection_control",
    "detection",
    "recommended_action",
    "keywords",
]
ws.append(headers)

rows = [
    ("Loading / Placement", "correct loading", "Part not loaded", "ME: Line stoppage", 4, "-", "SOP not followed", 2, "SOP Adherence", "Part Presence checking", 3, "Add presence sensor interlock", "pick place load align fixture"),
    ("Loading / Placement", "", "Part loaded in wrong orientation", "ME: Part damage\nCE: Durability risk", 7, "-", "SOP not followed", 1, "Fixture Poka Yoke", "Fixture Poka Yoke", 3, "", "orient align place load"),
    ("Loading / Placement", "", "Wrong part loaded on fixture", "ME: Part damage\nCE: Durability risk", 7, "-", "SOP not followed / mix-up", 1, "Fixture Poka Yoke", "Fixture Poka Yoke", 3, "", "lh rh case fixture"),
    ("Oil / Lubrication", "oil application", "Oil application missing", "ME: Part damage\nCE: Durability risk / Oil leak", 7, "-", "SOP not followed", 2, "SOP Adherence", "In station visual detection", 7, "Presence sensor interlock with process", "oil brush seal cavity"),
    ("Oil / Lubrication", "", "Less oil application", "ME: Part damage\nCE: Durability risk / Oil leak", 7, "-", "SOP not followed", 2, "SOP Adherence", "In station visual detection", 7, "", "oil lubric"),
    ("Oil / Lubrication", "", "More oil application", "ME: Oil overflow\nCE: NA", 2, "-", "SOP not followed", 3, "SOP Adherence", "In station visual detection", 7, "", "oil excess"),
    ("Torquing & Fastening", "torque", "Under-torqued fastener", "ME: Fastener loose\nCE: Durability / NVH / leak risk", 8, "SC", "Wrong torque program / tool not seated", 2, "Torque tool with program interlock", "Torque OK/NG signal to MES", 2, "Verify torque strategy & angle monitoring", "torque tighten bolt gun"),
    ("Torquing & Fastening", "", "Over-torqued fastener", "ME: Thread damage\nCE: Durability risk", 7, "SC", "Wrong torque program selected", 1, "Tool program locked to station", "Torque OK/NG signal to MES", 2, "", "torque over"),
    ("Torquing & Fastening", "", "Missing washer / bolt", "ME: Incomplete assembly\nCE: Durability risk", 7, "-", "SOP not followed", 2, "Kit / pre-assemble check", "In station visual detection", 5, "", "washer bolt pre-assemble"),
    ("Press Fit", "press", "Incomplete press / under-travel", "ME: Bearing/seal not seated\nCE: Noise / leak / durability", 8, "CC", "Press force/stroke out of spec", 2, "Press force & stroke monitoring", "Press curve OK/NG interlock", 2, "Tighten force window", "press bearing seal cylinder"),
    ("Press Fit", "", "Part misaligned during press", "ME: Part damage\nCE: Durability risk", 7, "-", "Fixture not locating", 2, "Fixture locators / poka-yoke", "Press force anomaly detection", 3, "", "press align"),
    ("Scanning / Traceability", "scan", "Scanning missed", "ME: Traceability break / line stoppage", 4, "-", "SOP not followed", 2, "SOP Adherence", "Scanning interlock", 1, "", "scan qr mes"),
    ("Scanning / Traceability", "", "Wrong part scanned", "ME: Incorrect genealogy", 4, "-", "SOP not followed / mix-up", 3, "SOP Adherence", "Scanning interlock", 1, "", "scan wrong"),
    ("Assembly / Insertion", "insert", "Part / gasket not inserted", "ME: Incomplete assembly\nCE: Leak / durability", 7, "-", "SOP not followed", 2, "SOP Adherence / kit check", "In station visual detection", 5, "", "gasket dowel insert assembl"),
    ("Assembly / Insertion", "", "Wrong orientation of inserted part", "ME: Part damage / rework", 7, "-", "SOP not followed", 2, "Poka-yoke / orientation feature", "In station visual detection", 5, "", "insert orient gasket gear"),
    ("Leak Test", "leak", "False accept of leaking unit", "ME: Escape to customer\nCE: Oil leak / warranty", 9, "CC", "Calibration drift / wrong test recipe", 1, "Master leak check / calibration", "Leak tester OK/NG interlock", 2, "Daily master verification", "leak test"),
    ("Inspection / Test", "inspect", "Out-of-spec unit accepted", "ME: Escape\nCE: NVH / function / durability", 8, "SC", "Wrong limits / gauge error", 1, "Gauge R&R / calibration", "Tester OK/NG interlock", 2, "", "backlash nvh inspect test"),
    ("Oil Fill", "fill", "Under-fill oil quantity", "ME: Lubrication shortage\nCE: Durability / noise", 8, "SC", "Dispenser calibration / recipe error", 2, "Gravimetric / volume interlock", "Fill quantity OK/NG", 2, "", "oil fill filling"),
    ("Handling / Transfer", "move", "Part / pallet collision or drop", "ME: Part damage / line stoppage", 6, "-", "Mis-sequence / sensor fault", 2, "Interlocks / soft stops", "Operator visual / station sensors", 4, "", "movement transfer wpc lift"),
    ("General Process", "", "Process step skipped", "ME: Incomplete process\nCE: Quality risk", 6, "-", "SOP not followed", 2, "SOP Adherence / station interlock", "In station visual detection", 5, "", "general"),
]
for r in rows:
    ws.append(list(r))
for col in ws.columns:
    ws.column_dimensions[col[0].column_letter].width = 28
lib_path = SAMPLES / "failure-mode-library.xlsx"
lib.save(lib_path)
print(f"Wrote {lib_path}")

# --- Copy user's MPP as demo (xlsx without VBA) ---
upload = Path("/home/ubuntu/.cursor/projects/agent-repos-PFMEA/uploads/MPP_BOP_BOE_Report__1__21af.xlsm")
demo = SAMPLES / "demo-mpp-bop-boe.xlsx"
if upload.exists():
    wb = openpyxl.load_workbook(upload, data_only=False, keep_vba=False)
    wb.save(demo)
    print(f"Wrote {demo} from uploaded MPP")
else:
    # Minimal synthetic fallback
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Sheet1"
    ws["A1"] = "Siemens PLM Software"
    ws["A2"] = "Teamcenter Excel Export"
    headers_mpp = ["Level", None, None, None, None, None, "Type", "ID", "Revision ID", "Make or Buy", "Quantity", "Parent", "Takt time", "Head Count", "Cycle time"]
    for i, h in enumerate(headers_mpp, 1):
        if h:
            ws.cell(5, i, h)
    data = [
        (0, "B", "TRANSMISSION LINE", "Ather Proc Area Revision", "AA00000085"),
        (1, "C", "GEAR BOX ASSEMBLY LINE", "Ather Proc Line Revision", "PL00000201"),
        (2, "D", "GA 10 - OIL BOLT ASSEMBLY", "Ather Proc Stn Revision", "PS00003903"),
        (3, "E", "MACHINE GB 10", "Machine Revision", "AI00000528"),
        (3, "E", "PICK GEAR CASE RH WITHIN REACH ALIGN AND PLACE ONTO WPC", "Ather Opn Revision", "AT00028019"),
        (3, "E", "SECURE TORQUE GUN TIGHTEN BOLT AND RELEASE TOOL.", "Ather Opn Revision", "AT00028026"),
        (2, "D", "GA 20 - RH CASE BEARING AND LH CASE  OIL SEAL PRESSING", "Ather Proc Stn Revision", "PS00003904"),
        (3, "E", "CYLINDER PRESSES THE 1ST BEARING AND RETURNS TO THE HOME POSITION.", "Ather Opn Revision", "AT00028032"),
    ]
    r = 6
    parent_stn = ""
    for level, col, name, typ, idv in data:
        ws.cell(r, 1, str(level))
        col_idx = openpyxl.utils.column_index_from_string(col)
        ws.cell(r, col_idx, name)
        ws.cell(r, 7, typ)
        ws.cell(r, 8, idv)
        ws.cell(r, 9, "01")
        ws.cell(r, 11, 1)
        if "Stn" in typ:
            parent_stn = f"{idv}/01;1-{name} x 1"
        elif level >= 3 and parent_stn:
            ws.cell(r, 12, parent_stn)
        r += 1
    wb.save(demo)
    print(f"Wrote synthetic {demo}")

# Blank PFMEA template (structure only)
blank = openpyxl.Workbook()
bws = blank.active
bws.title = "PFMEA"
bws["A1"] = "Process Failure Mode and Effects Analysis"
bws["A2"] = "Company name"
bws["F2"] = "PFMEA No"
hdr = [
    "Operation Sequence No.", "Operation Description", "S No", "Requirement",
    "Potential Failure Mode", "Potential Failure Effects", "SEV", "Class",
    "Potential Cause(s) of Failure", "OCC",
    "Current PROCESS Controls - Prevention -", "Current PROCESS Controls - Detection -",
    "DET", "RPN", "Actions Recommended", "Responsibility and Target Date",
    "Actions Taken and Completion Date", "SEV", "OCC", "DET", "RPN",
]
for i, h in enumerate(hdr, 1):
    bws.cell(6, i, h)
blank_path = SAMPLES / "blank-pfmea-template.xlsx"
blank.save(blank_path)
print(f"Wrote {blank_path}")

readme = SAMPLES / "README.txt"
readme.write_text(
    "demo-mpp-bop-boe.xlsx — Teamcenter MPP export (BOP stations/ops + BOE machines/parts)\n"
    "failure-mode-library.xlsx — editable company failure-mode library\n"
    "blank-pfmea-template.xlsx — empty PFMEA column layout matching AE VL style\n",
    encoding="utf-8",
)
print("Done.")
