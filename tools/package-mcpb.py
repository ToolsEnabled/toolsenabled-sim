#!/usr/bin/env python3
"""Build the offline Sim bundle with the unmodified, pinned mcpb 2.1.2 CLI."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent

def members(root):
    files = json.loads((root / 'tools/package-files.json').read_text())
    if files != sorted(set(files)) or 'server.json' in files:
        raise ValueError('Invalid source allowlist')
    deps = json.loads(subprocess.check_output(['node', str(ROOT / 'tools/package-inputs.mjs'), str(root)], text=True))
    files.extend(deps['files'])
    for name in files:
        rel = Path(name)
        if rel.is_absolute() or '..' in rel.parts or '\\' in name or rel.as_posix() != name:
            raise ValueError('Unsafe package path')
        source = root / rel
        if not source.is_file() or source.is_symlink() or any(p.is_symlink() for p in source.parents if p != root):
            raise ValueError('Not a regular package file: ' + name)
    if len(files) != len(set(files)): raise ValueError('Duplicate package path')
    return sorted(files)

def build(cli, output):
    if subprocess.check_output(['git','status','--porcelain'],cwd=ROOT,text=True).strip():
        raise ValueError('Commit source before packaging')
    tracked = sorted(subprocess.check_output(['git','ls-files','-z'],cwd=ROOT,text=True).strip('\0').split('\0'))
    if tracked != json.loads((ROOT/'tools/package-files.json').read_text()):
        raise ValueError('Source allowlist differs from tracked files')
    cli = cli.resolve(strict=True)
    version = subprocess.check_output(['node', str(cli), '--version'], text=True).strip()
    if version != '2.1.2': raise ValueError('Expected mcpb CLI 2.1.2')
    output = output.resolve()
    if output.exists() or output == ROOT or ROOT in output.parents:
        raise ValueError('Output must be new and outside the product')
    files = members(ROOT)
    versions = {name:json.loads((ROOT/'node_modules'/name/'package.json').read_text())['version'] for name in json.loads((ROOT/'tools/dependency-files.json').read_text())}
    output.parent.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ, SOURCE_DATE_EPOCH='1767225600', TZ='UTC')
    env.pop('DISPLAY', None)
    with tempfile.TemporaryDirectory(prefix='sim-mcpb-') as tmp:
        stage = Path(tmp)
        for name in files:
            target = stage / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / name, target)
            target.chmod(0o644)
        subprocess.run(['node', '--require', str(ROOT / 'tools/mcpb-clock.cjs'), str(cli), 'pack', str(stage), str(output)], env=env, check=True)
        with zipfile.ZipFile(output) as bundle:
            if sorted(bundle.namelist()) != files:
                raise ValueError('mcpb changed the reviewed inventory')
            for name in files:
                if bundle.read(name) != (ROOT / name).read_bytes():
                    raise ValueError('mcpb changed source bytes: ' + name)
    return {'archive': output.name, 'sha256': hashlib.sha256(output.read_bytes()).hexdigest(), 'bytes': output.stat().st_size, 'files':len(files), 'mcpb':version, 'sourceDateEpoch':env['SOURCE_DATE_EPOCH'], 'signed':False, 'dependencies':versions, 'sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mcpb-cli', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(build(args.mcpb_cli, args.output), sort_keys=True))
