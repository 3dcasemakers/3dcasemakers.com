"""Create and verify a Desktop delivery ZIP without dependencies or local secrets."""
from pathlib import Path
from datetime import datetime
import hashlib
import json
import os
import zipfile

root = Path(__file__).resolve().parents[1]
desktop = Path(os.environ['USERPROFILE']) / 'Desktop'
desktop.mkdir(parents=True, exist_ok=True)
archive = desktop / '3DCaseMakers-Audited-2026-10-04.zip'
if archive.exists():
    archive = desktop / f'3DCaseMakers-Audited-{datetime.now():%Y%m%d-%H%M%S}.zip'
excluded = {'node_modules', '.git', '__pycache__', '.cache', '.vite', '.idea', '.vscode'}
prefix = '3dcasemakers.com-main/'
manifest = []
with zipfile.ZipFile(archive, 'x', zipfile.ZIP_DEFLATED, compresslevel=6) as bundle:
    for parent, dirs, names in os.walk(root):
        dirs[:] = sorted(d for d in dirs if d.lower() not in excluded)
        for name in sorted(names):
            source = Path(parent) / name
            relative = source.relative_to(root)
            parts = tuple(p.lower() for p in relative.parts)
            lowered = name.lower()
            if source.is_symlink():
                continue
            if lowered.startswith('.env') and lowered != '.env.example':
                continue
            if lowered.endswith(('.log', '.zip', '.pyc')) or lowered == '.ds_store':
                continue
            if parts[:2] == ('backend', 'uploads'):
                continue
            if parts[0] == 'verification' and lowered.endswith(('.png', '.jpg', '.jpeg', '.html')):
                continue
            data = source.read_bytes()
            entry = prefix + relative.as_posix()
            bundle.writestr(entry, data)
            manifest.append({'path': relative.as_posix(), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
    bundle.writestr(prefix + 'verification/package-manifest.json', json.dumps(manifest, indent=2))

required = ['frontend/dist/index.html', 'frontend/package-lock.json', 'backend/package-lock.json',
            'frontend/src/utils/cartItems.ts', 'frontend/src/components/admin/settingsPersistence.ts',
            'backend/src/utils/orderAccess.js', 'AUDIT_REPORT.md', 'HOSTINGER_DEPLOY.md',
            'verification/admin-functional.json', 'verification/browser/results.json',
            'verification/browser/targeted-results.json']
with zipfile.ZipFile(archive) as bundle:
    assert bundle.testzip() is None, 'ZIP checksum failure'
    names = bundle.namelist()
    assert all(prefix + path in names for path in required), 'Missing delivery file'
    assert not any(set(Path(name).parts) & excluded for name in names), 'Dependencies included'
    assert not any(Path(name).name.startswith('.env') and Path(name).name != '.env.example' for name in names), 'Local environment included'
    for entry in manifest:
        data = bundle.read(prefix + entry['path'])
        assert hashlib.sha256(data).hexdigest() == entry['sha256'], entry['path']
print(json.dumps({'zip': str(archive), 'sizeMB': round(archive.stat().st_size / 1048576, 2),
                  'files': len(manifest), 'crcAndHashesVerified': True, 'nodeModulesIncluded': False}, indent=2))
