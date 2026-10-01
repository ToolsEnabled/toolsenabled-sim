"""Release regression: python3 test/deepseek-config.test.py (PyYAML 6.0.3)."""
import json
import os
from pathlib import Path
import subprocess
import unittest
import yaml

ROOT = Path(__file__).resolve().parents[1]

class DeepSeekConfig(unittest.TestCase):
    def test_cordis_profile_overlay(self):
        connection = str(ROOT / "runs/private space 'quoted'/connection-amber.json")
        raw = subprocess.check_output([os.environ.get('SIM_NODE', 'node'), 'tools/mcp-config.mjs', '--client', 'deepseek', '--connection', connection], cwd=ROOT, text=True)
        overlay = yaml.safe_load(raw)
        self.assertIsInstance(overlay, list)
        self.assertEqual(len(overlay), 1)
        self.assertEqual(set(overlay[0]), {'insert'})
        self.assertEqual(len(overlay[0]['insert']), 1)
        entry = overlay[0]['insert'][0]
        self.assertEqual(entry['id'], 'mcp-toolsenabled-sim')
        self.assertEqual(entry['name'], '@deepseek-ai/dsh-mcp-client')
        config = entry['config']
        self.assertEqual(set(config), {'serverName', 'transport', 'command', 'args', 'env', 'toolCallTimeoutMs'})
        self.assertEqual(config['serverName'], 'toolsenabled_sim')
        self.assertEqual(config['transport'], 'stdio')
        expected = json.loads(subprocess.check_output([os.environ.get('SIM_NODE', 'node'), 'tools/mcp-config.mjs', '--client', 'claude', '--connection', connection], cwd=ROOT, text=True))['mcpServers']['toolsenabled_sim']
        for key in ('command', 'args', 'env'):
            self.assertEqual(config[key], expected[key])
        self.assertEqual(config['toolCallTimeoutMs'], 15000)
        self.assertNotIn('mcpServers', entry)

if __name__ == '__main__':
    unittest.main()
