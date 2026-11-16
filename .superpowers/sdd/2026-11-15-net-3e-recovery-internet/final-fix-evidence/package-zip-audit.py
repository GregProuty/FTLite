from pathlib import Path
import hashlib,json,zipfile
root=Path('.superpowers/sdd/2026-11-15-net-3e-recovery-internet/final-fix-evidence')
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
records=[]
for name in ['candidate','rollback-disabled']:
    directory=Path('dist/net-3e-final-'+name)/'win-unpacked'
    archive=Path('dist/net-3e-final-'+name+'.zip')
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        for p in sorted(directory.rglob('*')):
            if p.is_file():z.write(p,p.relative_to(directory).as_posix())
    with zipfile.ZipFile(archive) as z:
        names=z.namelist()
        assert len(names)==len(set(names))
        expected={p.relative_to(directory).as_posix() for p in directory.rglob('*') if p.is_file()}
        assert set(names)==expected
        members={}
        for name2 in ['FTLite.exe','resources/app.asar']:
            value=hashlib.sha256(z.read(name2)).hexdigest()
            assert value==sha(directory/name2)
            members[name2]=value
    records.append(dict(path=str(archive).replace('\\','/'),bytes=archive.stat().st_size,sha256=sha(archive),exactPaths=True,noDuplicates=True,memberHashes=members))
(root/'zip-member-audit.json').write_text(json.dumps(records,indent=2)+'\n')
print(json.dumps(records,indent=2))
