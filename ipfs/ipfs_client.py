"""
Step 10: IPFS Integration
- Upload raw clinical trial files to IPFS
- Return CID + SHA-256 hash for on-chain storage
- On-chain/off-chain linking: timestamp + Trial ID + CID
"""
import hashlib, json, os, time, tempfile
from pathlib import Path
from typing import Dict, Optional

try:
    import ipfshttpclient
    IPFS_AVAILABLE = True
except ImportError:
    IPFS_AVAILABLE = False


# ──────────────────────────────────────────────────────────────
# IPFS Client Wrapper
# ──────────────────────────────────────────────────────────────

class IPFSClient:
    """
    Wraps ipfshttpclient to upload / pin / retrieve content.
    Falls back to a local mock store when IPFS daemon is unavailable.
    """

    def __init__(self, api_url: str = "/ip4/127.0.0.1/tcp/5001"):
        self.api_url   = api_url
        self._client   = None
        self._mock: Dict[str, bytes] = {}    # cid → content (mock)
        self._connected = False
        self._try_connect()

    def _try_connect(self):
        if not IPFS_AVAILABLE:
            print("⚠️  ipfshttpclient not installed — using local mock store")
            return
        try:
            self._client = ipfshttpclient.connect(self.api_url)
            self._connected = True
            print(f"✅ Connected to IPFS daemon at {self.api_url}")
        except Exception as e:
            print(f"⚠️  IPFS daemon unavailable ({e}) — using local mock store")

    # ── Upload ────────────────────────────────────────────────

    def upload_bytes(self, data: bytes, filename: str = "data.json") -> Dict:
        """Upload raw bytes to IPFS, return CID + SHA-256."""
        sha256 = hashlib.sha256(data).hexdigest()

        if self._connected and self._client:
            with tempfile.NamedTemporaryFile(suffix=Path(filename).suffix,
                                             delete=False) as tmp:
                tmp.write(data); tmp_path = tmp.name
            try:
                result = self._client.add(tmp_path, pin=True)
                cid    = result["Hash"]
            finally:
                os.unlink(tmp_path)
        else:
            # Mock CID: deterministic from content hash
            cid = "Qm" + sha256[:44]
            self._mock[cid] = data

        return {"cid": cid, "sha256": sha256, "size_bytes": len(data)}

    def upload_dict(self, record: dict) -> Dict:
        data = json.dumps(record, indent=2, default=str).encode("utf-8")
        return self.upload_bytes(data, "record.json")

    def upload_file(self, filepath: str) -> Dict:
        path = Path(filepath)
        if not path.exists():
            raise FileNotFoundError(f"File not found: {filepath}")
        data = path.read_bytes()
        return self.upload_bytes(data, path.name)

    # ── Retrieve ──────────────────────────────────────────────

    def retrieve(self, cid: str) -> Optional[bytes]:
        if self._connected and self._client:
            try:
                return self._client.cat(cid)
            except Exception as e:
                print(f"IPFS retrieve error: {e}")
                return None
        return self._mock.get(cid)

    # ── On-chain link record ──────────────────────────────────

    def build_link_record(
        self,
        trial_id: str,
        cid: str,
        sha256: str,
        uploader_node_id: str,
    ) -> Dict:
        """
        Produces a minimal record to be stored on-chain:
        { trial_id, cid, sha256, timestamp, uploader }.
        This is what the smart contract stores (not the raw data).
        """
        return {
            "trial_id":         trial_id,
            "ipfs_cid":         cid,
            "sha256_hash":      sha256,
            "timestamp":        time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "uploader_node_id": uploader_node_id,
        }

    def status(self) -> Dict:
        return {
            "connected":    self._connected,
            "api_url":      self.api_url,
            "mock_entries": len(self._mock),
            "ipfs_available": IPFS_AVAILABLE,
        }


# ──────────────────────────────────────────────────────────────
# On-chain vs Off-chain Comparison
# ──────────────────────────────────────────────────────────────

COMPARISON_TABLE = {
    "Feature":       ["On-Chain", "Off-Chain (IPFS)"],
    "Storage Cost":  ["Very High (~$$/KB on Ethereum)", "Very Low (free/peer-hosted)"],
    "Size Limit":    ["Tiny (<1 KB typical)", "No hard limit (GBs possible)"],
    "Immutability":  ["Absolute — cannot alter", "Content-addressed (CID locked)"],
    "Privacy":       ["Public (unless private chain)", "Public by default; can encrypt"],
    "Speed":         ["Slow (block time)", "Fast (direct content fetch)"],
    "Use Case":      ["Hashes, CIDs, metadata", "Raw data, genomic files, docs"],
}


def print_comparison():
    print("\n" + "="*70)
    print("On-Chain vs Off-Chain (IPFS) Storage Comparison")
    print("="*70)
    for feature, vals in COMPARISON_TABLE.items():
        print(f"\n{feature}:")
        print(f"  On-Chain  : {vals[0]}")
        print(f"  Off-Chain : {vals[1]}")
    print("="*70)


# ──────────────────────────────────────────────────────────────
# Self-test
# ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    client = IPFSClient()

    sample = {
        "trial_id":    "NCT03000001",
        "patient_id":  "PAT-010001",
        "drug_name":   "Metformin",
        "genomic_ref": "BRCA1:c.5266dupC",
        "raw_logs":    "Dosage administered at 08:00. Patient stable. Adverse: Mild nausea.",
    }

    print("\n📤 Uploading to IPFS…")
    result = client.upload_dict(sample)
    print(f"  CID    : {result['cid']}")
    print(f"  SHA256 : {result['sha256']}")
    print(f"  Size   : {result['size_bytes']} bytes")

    link = client.build_link_record(
        "NCT03000001", result["cid"], result["sha256"], "NODE-01"
    )
    print("\n🔗 On-chain link record:")
    for k, v in link.items():
        print(f"  {k}: {v}")

    print("\n📥 Retrieve from IPFS:")
    content = client.retrieve(result["cid"])
    print(f"  Retrieved {len(content)} bytes" if content else "  Failed")

    print_comparison()
    print("\nStatus:", client.status())
