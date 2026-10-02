#!/usr/bin/env python3
"""Generate external Registry/marketplace sidecars only from an already pushed release."""
import argparse
import hashlib
import io
import json
import re
import subprocess
import urllib.request
import zipfile
from pathlib import Path, PurePosixPath


def archive_members(payload, wrapper=''):
    files={};size=0
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        for entry in archive.infolist():
            name=entry.filename
            if wrapper and not name.startswith(wrapper):raise ValueError('Expected a single sim/ wrapper')
            name=name[len(wrapper):]
            if not name or name.startswith('/') or '\\' in name or any(p in ('','.','..') for p in name.split('/')):
                raise ValueError('Unsafe archive member or wrapper')
            if name in files or entry.is_dir() or entry.flag_bits & 1 or (entry.external_attr >> 16) & 0o170000 not in (0,0o100000):
                raise ValueError('Duplicate or non-regular archive members')
            size+=entry.file_size
            if entry.file_size>64*1024*1024 or size>128*1024*1024:raise ValueError('Archive exceeds size bound')
            files[name]=archive.read(entry)
    return files


def bind_archives(git, commit, expected_tree, archive_bytes, payload, manifest):
    tree=git('rev-parse',commit+'^{tree}').decode().strip()
    if not re.fullmatch(r'[0-9a-f]{40}',expected_tree) or tree!=expected_tree:raise ValueError('Commit differs from reviewed expected tree')
    zipped=archive_members(archive_bytes,'sim/');bundled=archive_members(payload)
    plugin=json.loads(zipped.get('.claude-plugin/plugin.json',b'{}'))
    if any(plugin.get(key)!=manifest[key] for key in ['name','version']):raise ValueError('Offline ZIP identity/version differs from pushed source')
    if zipped.keys()!=bundled.keys():raise ValueError('ZIP and mcpb members differ')
    if any(data!=bundled[name] for name,data in zipped.items()):raise ValueError('ZIP and mcpb member bytes differ')
    tracked={}
    for record in git('ls-tree','-rz',commit).split(b'\0'):
        if not record:continue
        metadata,name=record.split(b'\t',1);mode,kind,oid=metadata.decode().split();name=name.decode()
        if mode not in ('100644','100755') or kind!='blob':raise ValueError('Non-regular reviewed tree member')
        tracked[name]=oid
    inventory=json.loads(git('show',commit+':tools/dependency-files.json'))
    vendored={}
    for name,dependency in inventory.items():
        for relative,entry in dependency['files'].items():
            path='node_modules/'+name+'/'+relative
            if path in tracked or path in vendored or '..' in PurePosixPath(path).parts:raise ValueError('Invalid dependency inventory')
            vendored[path]=entry['sha256']
    if zipped.keys()!=tracked.keys()|vendored.keys():raise ValueError('Archive members differ from reviewed tree and dependency inventory')
    for name,oid in tracked.items():
        data=zipped[name]
        if hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()!=oid:raise ValueError('Archive bytes differ from reviewed tree: '+name)
    for name,sha in vendored.items():
        if hashlib.sha256(zipped[name]).hexdigest()!=sha:raise ValueError('Dependency bytes differ from reviewed tree inventory: '+name)
    return tree


def generate(source, repository, tag, commit, signed, release_url, archive, archive_url, output, expected_tree, description=None):
    if not re.fullmatch(r'https://github.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repository):
        raise ValueError('Expected the public HTTPS GitHub repository URL')
    if not re.fullmatch(r'v[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?', tag) or not re.fullmatch(r'[0-9a-f]{40}', commit):
        raise ValueError('Expected exact version tag and full pushed commit')
    source = source.resolve(strict=True)
    output = output.resolve()
    if output == source or source in output.parents or output.exists():
        raise ValueError('Output must be a new directory outside the product checkout')
    refs = subprocess.check_output(['git', 'ls-remote', '--exit-code', repository, 'refs/tags/' + tag, 'refs/tags/' + tag + '^{}'], text=True)
    remote = {line.split()[1]: line.split()[0] for line in refs.splitlines()}
    peeled = remote.get('refs/tags/' + tag + '^{}', remote.get('refs/tags/' + tag))
    if peeled != commit:
        raise ValueError('Remote tag does not point at the supplied pushed commit')
    def git(*args):
        return subprocess.check_output(['git', *args], cwd=source)
    manifest = json.loads(git('show', commit + ':.claude-plugin/plugin.json'))
    if manifest['version'] != tag[1:]:
        raise ValueError('Pushed plugin version differs from tag')
    description = manifest['description'] if description is None else description
    if not isinstance(description, str) or not 1 <= len(description) <= 100 or not description.strip():
        raise ValueError('Registry description must be complete text of 1–100 characters; supply an explicit --description')
    payload = signed.read_bytes()
    if not payload.endswith(b'MCPB_SIG_END'):
        raise ValueError('Expected a signed mcpb; cryptographic/production trust qualification is a separate gate')
    with zipfile.ZipFile(io.BytesIO(payload)) as z:
        desktop = json.loads(z.read('manifest.json'))
        if desktop['version'] != manifest['version'] or desktop['name'] != manifest['name']:
            raise ValueError('Signed bundle identity differs from pushed source')
        if 'server.json' in z.namelist():
            raise ValueError('Registry sidecar must not be bundled')
    if not release_url.startswith(repository + '/releases/download/' + tag + '/') or not release_url.endswith('.mcpb'):
        raise ValueError('Expected exact tagged HTTPS mcpb release URL')
    with urllib.request.urlopen(release_url, timeout=30) as response:
        downloaded = response.read(64 * 1024 * 1024 + 1)
    if downloaded != payload:
        raise ValueError('Downloaded release bytes differ from supplied signed artifact')
    if not archive_url.startswith(repository + '/releases/download/' + tag + '/') or not archive_url.endswith('.zip'):
        raise ValueError('Expected exact tagged HTTPS offline ZIP URL')
    archive_bytes = archive.read_bytes()
    with urllib.request.urlopen(archive_url, timeout=30) as response:
        if response.read(64 * 1024 * 1024 + 1) != archive_bytes:
            raise ValueError('Downloaded offline ZIP differs from supplied artifact')
    tree = bind_archives(git, commit, expected_tree, archive_bytes, payload, manifest)
    digest = hashlib.sha256(payload).hexdigest()
    archive_digest = hashlib.sha256(archive_bytes).hexdigest()
    name = manifest['name']
    if not name.startswith('toolsenabled-'):
        raise ValueError('Unexpected permanent plugin name')
    registry = {'$schema': 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
                'name': 'ai.toolsenabled/' + name.removeprefix('toolsenabled-'), 'description': description,
                'version': manifest['version'], 'websiteUrl': 'https://toolsenabled.ai',
                'repository': {'url': repository, 'source': 'github'},
                'packages': [{'registryType': 'mcpb', 'identifier': release_url, 'fileSha256': digest, 'transport': {'type': 'stdio'}}]}
    # Sim's Git tag is dependency-incomplete; install the reviewed offline ZIP.
    entry = {'name': name, 'source': {'source': 'archive', 'url': archive_url, 'sha256': archive_digest}}
    pins = {'status': 'pushed-release', 'repository': repository, 'tag': tag, 'sourceCommit': commit,
            'sourceTree': tree, 'expectedTree': expected_tree, 'archiveMembersVerified': True, 'signedMcpbSha256': digest,
            'releaseUrl': release_url, 'archiveUrl': archive_url, 'archiveSha256': archive_digest, 'remoteTagVerified': True, 'downloadVerified': True}
    output.mkdir(parents=True)
    for filename, value in [('server.json', registry), ('marketplace-entry.json', entry), ('SOURCE-PINS.json', pins)]:
        (output / filename).write_text(json.dumps(value, indent=2) + '\n')
    return pins

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--repository', required=True)
    parser.add_argument('--tag', required=True)
    parser.add_argument('--commit', required=True)
    parser.add_argument('--expected-tree', required=True, help='Full tree ID from the reviewed handoff')
    parser.add_argument('--signed-mcpb', type=Path, required=True)
    parser.add_argument('--release-url', required=True)
    parser.add_argument('--archive', type=Path, required=True)
    parser.add_argument('--archive-url', required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--description', help='Reviewed complete Registry description, 1–100 characters; used verbatim')
    args = parser.parse_args()
    print(json.dumps(generate(args.source, args.repository, args.tag, args.commit, args.signed_mcpb, args.release_url, args.archive, args.archive_url, args.output, args.expected_tree, args.description), indent=2))
