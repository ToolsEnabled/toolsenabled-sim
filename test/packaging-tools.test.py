import hashlib
import base64
import py_compile
import gzip
import bz2
import lzma
import zlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import subprocess
import shutil
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parent.parent
def module(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), ROOT / 'tools' / (name + '.py'))
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value

class PackagingTests(unittest.TestCase):
    def test_scanner_rejects_hidden_compression_and_git_binary_hunks(self):
        handoff = module('handoff')
        sentinel = b'-----BEGIN ' + b'PRIVATE KEY-----\nsynthetic\n'
        encoders = [gzip.compress, bz2.compress, lzma.compress,
                    lambda b: lzma.compress(b, format=lzma.FORMAT_ALONE), zlib.compress]
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for encode in encoders:
                (root / 'innocent.data').write_bytes(encode(sentinel))
                with self.subTest(encoder=encode):
                    with self.assertRaises(ValueError): handoff.scan(root)
            nonstandard=bytearray(lzma.compress(sentinel,format=lzma.FORMAT_ALONE))
            nonstandard[1:5]=(123457).to_bytes(4,'little')
            self.assertEqual(lzma.decompress(nonstandard,format=lzma.FORMAT_ALONE),sentinel)
            (root / 'innocent.data').write_bytes(nonstandard)
            with self.assertRaisesRegex(ValueError,'private-key header'): handoff.scan(root)
            (root / 'innocent.data').write_bytes(b'GIT binary ' + b'patch\nliteral 40\nencoded\n')
            with self.assertRaisesRegex(ValueError, 'binary patch'): handoff.scan(root)
            (root / 'innocent.data').write_bytes(gzip.compress(b'plain safe content'))
            self.assertEqual(handoff.scan(root)['privateKeyHeaders'], 0)
            (root / 'innocent.data').write_bytes(gzip.compress(b'a' * 4096))
            with patch.object(handoff, 'MAX_FILE', 1024):
                with self.assertRaisesRegex(ValueError, 'bound'): handoff.scan(root)

    def test_scanner_refuses_uninspectable_formats_by_magic_or_suffix(self):
        handoff=module('handoff')
        # Genuine tar --zstd output, round-tripped through libzstd and tarfile.
        # Contains a synthetic key header; kept inline so tests need no zstd CLI.
        zstd_tar=base64.b64decode('KLUv/WAAJ2UDAAIFExtwxzohKkVpSxCKtPbwOIzsVB45/IMG/6eXIgOKJsG9ZVB2oQk20JoN2s2I0qOSVY3hLGZZZSHqSFcI6Cj1q8XA/KsS/P/n/1fWzwULACUXwANgC1aBAAXEG1IDQHKAAbQKnK20myegBQ==')
        magic=[bytes.fromhex(v) for v in ['28b52ffd','04224d18','1f9d']]+[b'LZIP']
        magic.extend(bytes([v,0x2a,0x4d,0x18]) for v in range(0x50,0x60))
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);path=root/'notes.txt'
            for data in [zstd_tar,*[prefix+b'unsupported stream' for prefix in magic]]:
                path.write_bytes(data)
                with self.subTest(prefix=data[:4].hex()):
                    with self.assertRaisesRegex(ValueError,'uninspectable'):handoff.scan(root)
            path.unlink()
            for suffix in ['.zst','.tzst','.lz4','.lz','.Z']:
                path=root/('notes'+suffix);path.write_bytes(b'unrecognized payload')
                with self.assertRaisesRegex(ValueError,'uninspectable'):handoff.scan(root)
                path.unlink()

    def test_lzma_probe_accepts_bytecode_without_relaxing_real_stream_bounds(self):
        handoff=module('handoff')
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);source=root/'ordinary.py';source.write_text('value = 42\n')
            py_compile.compile(str(source),cfile=str(root/'ordinary.pyc'),doraise=True)
            decoder=lzma.LZMADecompressor(format=lzma.FORMAT_ALONE)
            decoded=bytearray()
            with self.assertRaisesRegex(lzma.LZMAError,'^Input format not supported by decoder$'):
                for byte in (root/'ordinary.pyc').read_bytes():decoded.extend(decoder.decompress(bytes([byte])))
            self.assertEqual(decoded,b'')
            self.assertEqual(handoff.scan(root)['privateKeyHeaders'],0)
            payload=bytearray(lzma.compress(b'safe',format=lzma.FORMAT_ALONE))
            payload[1:5]=(1<<30).to_bytes(4,'little')
            (root/'notes.txt').write_bytes(payload)
            with self.assertRaisesRegex(ValueError,'invalid compressed'):handoff.scan(root)
            (root/'notes.txt').write_bytes(lzma.compress(b'a'*4096,format=lzma.FORMAT_ALONE))
            with patch.object(handoff,'MAX_FILE',1024):
                with self.assertRaisesRegex(ValueError,'compressed'):handoff.scan(root)

    def test_corrupted_lzma_with_recoverable_key_is_refused(self):
        handoff=module('handoff')
        # Reproduce review probe/lz1: recoverable content, then corruption.
        sentinel=b'-----BEGIN '+b'PRIVATE KEY-----\nsynthetic fixture only\n'
        plain=sentinel+b'A'*20000
        payload=bytearray(lzma.compress(plain,format=lzma.FORMAT_ALONE))
        payload[-1]^=1
        self.assertIsNone(handoff.KEY.search(payload))
        decoder=lzma.LZMADecompressor(format=lzma.FORMAT_ALONE)
        recovered=bytearray()
        with self.assertRaisesRegex(lzma.LZMAError,'^Corrupt input data$'):
            for byte in payload:recovered.extend(decoder.decompress(bytes([byte])))
        self.assertIsNotNone(handoff.KEY.search(recovered))
        self.assertGreaterEqual(len(recovered),19000)
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'data.bin').write_bytes(payload)
            with self.assertRaisesRegex(ValueError,'invalid compressed stream refused'):handoff.scan(root)

    def test_lzma_format_rejection_after_output_is_refused(self):
        handoff=module('handoff')
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'data.bin').write_bytes(lzma.compress(b'safe',format=lzma.FORMAT_ALONE))
            # A format error is not an escape hatch once any output was emitted.
            with patch.object(handoff.lzma,'LZMADecompressor') as factory:
                factory.return_value.eof=False
                factory.return_value.decompress.side_effect=[b'output',lzma.LZMAError('Input format not supported by decoder')]
                with self.assertRaisesRegex(ValueError,'invalid compressed stream refused'):handoff.scan(root)

    def test_scanner_accepts_its_own_packaged_source(self):
        handoff = module('handoff')
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'handoff.py').write_bytes((ROOT / 'tools/handoff.py').read_bytes())
            self.assertEqual(handoff.scan(root)['privateKeyHeaders'], 0)

    def test_inventory_copies_only_verified_files_and_rejects_unlisted_or_compressed_keys(self):
        handoff = module('handoff')
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / 'packet'; root.mkdir()
            (root / 'safe.txt').write_text('safe')
            (root / 'SHA256SUMS').write_text(hashlib.sha256(b'safe').hexdigest() + '  safe.txt\n')
            self.assertEqual(handoff.copy_packet(root, Path(tmp) / 'copy')['status'], 'PASS')
            (root / 'unexpected.txt').write_text('unlisted')
            with self.assertRaises(ValueError): handoff.copy_packet(root, Path(tmp) / 'bad-copy')
            (root / 'unexpected.txt').unlink()
            # Assemble the synthetic header so no key-shaped block is in source.
            sentinel = b'-----BEGIN ' + b'PRIVATE KEY-----\nsynthetic\n'
            with zipfile.ZipFile(root / 'nested.zip', 'w', compression=zipfile.ZIP_DEFLATED) as z: z.writestr('key.pem', sentinel)
            with self.assertRaisesRegex(ValueError, 'private-key header'): handoff.scan(root)
            (root / 'nested.zip').unlink()
            (root / 'unlisted.pem').write_bytes(sentinel)
            with self.assertRaisesRegex(ValueError, 'private-key header'): handoff.scan(root)

    def test_allowlist_contains_runtime_and_excludes_release_state(self):
        pack = module('package-mcpb')
        files = pack.members(ROOT)
        self.assertIn('src/mcp.mjs', files)
        self.assertIn('skills/toolsenabled-sim/SKILL.md', files)
        self.assertIn('node_modules/@dimforge/rapier3d-compat/rapier.es.js', files)
        self.assertEqual(files, sorted(set(files)))
        self.assertNotIn('server.json', files)
        self.assertFalse(any('/.git/' in f or f.endswith(('.zip','.mcpb','.pem')) for f in files))

    def test_vendored_files_are_loaded_or_required_metadata_and_notices(self):
        files = set(module('package-mcpb').members(ROOT))
        loaded = {'node_modules/@dimforge/rapier3d-compat/rapier.es.js'}
        loaded.update('node_modules/playwright-core/' + name for name in
                      ['browsers.json','index.js','index.mjs','lib/bootstrap.js','lib/coreBundle.js','lib/utilsBundle.js','package.json'])
        loaded.update('node_modules/three/build/' + name for name in ['three.core.js','three.module.js'])
        required = {'node_modules/@dimforge/rapier3d-compat/package.json', 'node_modules/three/package.json', 'node_modules/three/LICENSE'}
        required.update('node_modules/playwright-core/' + name for name in ['LICENSE','NOTICE','ThirdPartyNotices.txt','lib/utilsBundle.js.LICENSE','lib/webp_codec.LICENSE'])
        self.assertEqual({f for f in files if f.startswith('node_modules/')}, loaded | required)

    def test_packagers_validate_lock_identity_and_reviewed_file_hashes(self):
        pack = module('package-mcpb')
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            for name in pack.members(ROOT):
                dst=root/name;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(ROOT/name,dst)
            def reject(path, mutate, message):
                before=path.read_bytes()
                try:
                    mutate(path)
                    result=subprocess.run(['node',str(ROOT/'tools/package-inputs.mjs'),str(root)],capture_output=True,text=True)
                    self.assertNotEqual(result.returncode,0)
                    self.assertIn(message,result.stderr)
                finally: path.write_bytes(before)
            def alter(field,value):
                def change(path):
                    data=json.loads(path.read_text());data[field]=value;path.write_text(json.dumps(data))
                return change
            reject(root/'node_modules/three/package.json',alter('version','9.9.9'),'identity')
            reject(root/'node_modules/three/package.json',alter('name','wrong-name'),'identity')
            reject(root/'node_modules/three/build/three.module.js',lambda p:p.write_bytes(p.read_bytes()+b'\n// altered'),'hash')
            def wrong_lock(path):
                data=json.loads(path.read_text());data['packages']['node_modules/three']['version']='9.9.9';path.write_text(json.dumps(data))
            reject(root/'package-lock.json',wrong_lock,'lock')
            result=json.loads(subprocess.check_output(['node',str(ROOT/'tools/package-inputs.mjs'),str(root)]))
            self.assertEqual(result['versions']['three'],'0.180.0')

    def test_mcpb_refuses_dirty_source_before_packing(self):
        pack=module('package-mcpb')
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'tools').mkdir();(root/'tracked').write_text('clean')
            (root/'tools/package-files.json').write_text(json.dumps(['tools/package-files.json','tracked']))
            subprocess.run(['git','init','-q',str(root)],check=True)
            subprocess.run(['git','add','.'],cwd=root,check=True)
            subprocess.run(['git','-c','user.name=Test','-c','user.email=test@example.invalid','commit','-qm','fixture'],cwd=root,check=True)
            (root/'tracked').write_text('dirty')
            with patch.object(pack,'ROOT',root):
                with self.assertRaisesRegex(ValueError,'Commit source'): pack.build(root/'unused-cli',root.parent/'unused-output')

    def test_release_sidecars_bind_both_archives_to_the_reviewed_tree(self):
        release=module('generate-release');repo='https://github.com/ToolsEnabled/toolsenabled-sim'
        with tempfile.TemporaryDirectory() as tmp:
            base=Path(tmp);source=base/'source';source.mkdir();signed=base/'sim.mcpb';archive=base/'sim.zip'
            metadata={'name':'toolsenabled-sim','version':'0.1.2','description':'Offline simulation'}
            files={'.claude-plugin/plugin.json':json.dumps(metadata).encode(),'manifest.json':json.dumps(metadata).encode(),'tools/dependency-files.json':b'{}','tracked.txt':b'reviewed source'}
            for name,data in files.items():
                p=source/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
            subprocess.run(['git','init','-q',str(source)],check=True)
            subprocess.run(['git','add','.'],cwd=source,check=True)
            subprocess.run(['git','-c','user.name=Test','-c','user.email=test@example.invalid','commit','-qm','reviewed'],cwd=source,check=True)
            commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=source,text=True).strip()
            tree=subprocess.check_output(['git','rev-parse','HEAD^{tree}'],cwd=source,text=True).strip()
            def artifacts(zip_files=None,bundle_files=None,wrapper='sim/'):
                with zipfile.ZipFile(archive,'w') as z:
                    for name,data in (files if zip_files is None else zip_files).items():z.writestr(wrapper+name,data)
                with zipfile.ZipFile(signed,'w') as z:
                    for name,data in (files if bundle_files is None else bundle_files).items():z.writestr(name,data)
                with signed.open('ab') as out:out.write(b'MCPB_SIG_END')
            artifacts()
            original=subprocess.check_output
            def git(args,**kwargs):
                if args[1]=='ls-remote':return commit+'\trefs/tags/v0.1.2\n'
                return original(args,**kwargs)
            def download(url,**kwargs):return io.BytesIO(signed.read_bytes() if url.endswith('.mcpb') else archive.read_bytes())
            params=dict(source=source,repository=repo,tag='v0.1.2',commit=commit,expected_tree=tree,signed=signed,release_url=repo+'/releases/download/v0.1.2/sim.mcpb',archive=archive,archive_url=repo+'/releases/download/v0.1.2/sim.zip')
            with patch.object(release.subprocess,'check_output',side_effect=git),patch.object(release.urllib.request,'urlopen',side_effect=download):
                old=files|{'.claude-plugin/plugin.json':json.dumps(metadata|{'version':'0.1.1'}).encode()}
                artifacts(zip_files=old)
                with self.assertRaisesRegex(ValueError,'identity|version'):release.generate(**params,output=base/'old-version')
                for label,changed in [('source',files|{'tracked.txt':b'tampered'}),('extra',files|{'unexpected':b'extra'}),('missing',{k:v for k,v in files.items() if k!='tracked.txt'})]:
                    artifacts(zip_files=changed,bundle_files=changed)
                    with self.subTest(label=label):
                        with self.assertRaisesRegex(ValueError,'tree|members'):release.generate(**params,output=base/('bad-'+label))
                artifacts(wrapper='wrong/')
                with self.assertRaisesRegex(ValueError,'wrapper'):release.generate(**params,output=base/'wrapper')
                artifacts(bundle_files=files|{'extra':b'extra'})
                with self.assertRaisesRegex(ValueError,'members'):release.generate(**params,output=base/'different-bundle')
                artifacts()
                with self.assertRaisesRegex(ValueError,'tree'):release.generate(**(params|{'expected_tree':'b'*40}),output=base/'wrong-tree')
                out=base/'sidecars';pins=release.generate(**params,output=out)
                self.assertEqual(pins['sourceTree'],tree)
                self.assertEqual(json.loads((out/'marketplace-entry.json').read_text())['source']['sha256'],hashlib.sha256(archive.read_bytes()).hexdigest())
                with self.assertRaisesRegex(ValueError,'tag'):release.generate(**(params|{'commit':'c'*40}),output=base/'wrong-tag')
                with patch.object(release.urllib.request,'urlopen',return_value=io.BytesIO(b'tamper')):
                    with self.assertRaisesRegex(ValueError,'Downloaded'):release.generate(**params,output=base/'wrong-download')
                for value in ['', 'x'*101]:
                    with self.assertRaisesRegex(ValueError,'description'):release.generate(**params,output=base/'bad-description',description=value)
                description='Control warehouse robots offline with shared MCP tools, delivery guidance and exact replay.'
                release.generate(**params,output=base/'explicit',description=description)
                self.assertEqual(json.loads((base/'explicit/server.json').read_text())['description'],description)
            self.assertFalse((source/'server.json').exists())

if __name__=='__main__': unittest.main()
