from pathlib import Path
import hashlib,json,zipfile,shutil
root=Path('.superpowers/sdd/2026-11-15-net-3e-recovery-internet/final-fix-evidence')
c=json.loads((root/'candidate.json').read_text())
archive=Path('dist/net-3e-final-driver-source.zip')
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for p in c['sourceFiles']:z.write(p,p)
with zipfile.ZipFile(archive) as z:
    assert len(z.namelist())==len(c['sourceFiles'])
    for p,h in c['sourceFiles'].items():assert hashlib.sha256(z.read(p)).hexdigest()==h
(root/'driver-source-artifact.json').write_text(json.dumps(dict(path=archive.as_posix(),sha256=hashlib.sha256(archive.read_bytes()).hexdigest(),source=c['identity']['revision'],files=len(c['sourceFiles']),allMembersMatched=True),indent=2)+'\n')
files=['src/main/network/onlineSession.ts','scripts/network/online-app-smoke.cjs','scripts/network/online-recovery-smoke.ts','scripts/network/internet-app-smoke.ts','tests/onlineRecovery.test.ts','tests/onlineAppDiagnostics.test.ts','tests/onlineRecoveryPreparation.test.ts','scripts/network/internet-app-report.ts','tests/internetAppReport.test.ts']
for p in files:
    target=root/'source'/p;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,target)
(root/'tested-source.json').write_text(json.dumps(dict(revision=c['identity']['revision'],files={p:hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in files}),indent=2)+'\n')
print((root/'driver-source-artifact.json').read_text())
