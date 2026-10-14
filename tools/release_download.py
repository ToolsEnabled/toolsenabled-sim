"""Read one published release asset for tools/generate-release.py to compare byte for byte. Nothing read here is run or kept."""
import urllib.request

LIMIT = 64 * 1024 * 1024 + 1


def download(url):
    with urllib.request.urlopen(url, timeout=30) as response:
        return response.read(LIMIT)
