# -*- mode: python ; coding: utf-8 -*-
from pathlib import Path

ROOT = Path(SPECPATH).resolve().parent          # repo root (spec lives in packaging/)
BACKEND = ROOT / "backend"
DIST = ROOT / "frontend" / "dist"
ICON = ROOT / "packaging" / "AppIcon.icns"
icon_arg = str(ICON) if ICON.exists() else None  # tolerate a missing icon

a = Analysis(
    [str(ROOT / "packaging" / "desktop_entry.py")],
    pathex=[str(BACKEND)],
    binaries=[],
    datas=[(str(DIST), "frontend_dist")],
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops.auto",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan.on",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="Odoo Hours Logger",
    console=False,
    icon=icon_arg,
)
coll = COLLECT(exe, a.binaries, a.datas, name="Odoo Hours Logger")
app = BUNDLE(
    coll,
    name="Odoo Hours Logger.app",
    icon=icon_arg,
    bundle_identifier="engineering.daredata.odoo-hours-logger",
)
