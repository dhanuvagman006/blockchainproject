"""
Step 2: SHA-256 Hashing & Privacy Module
- Hash sensitive fields using SHA-256
- Demonstrate Avalanche Effect
- Hash comparison / tamper detection utility
"""
import hashlib
import json
from typing import Any, Dict, List, Tuple


# ─────────────────────────────────────────────
# Core hashing functions
# ─────────────────────────────────────────────

SENSITIVE_FIELDS = [
    "patient_id", "drug_name", "dosage_level_mg",
    "adverse_event", "age_group", "consent_hash"
]

PUBLIC_FIELDS = [
    "trial_id", "phase", "response_time_days",
    "adverse_event_flag", "timestamp", "node_id", "manipulated"
]


def sha256_hash(data: Any) -> str:
    """Compute SHA-256 hash of any serialisable value."""
    serialised = json.dumps(data, sort_keys=True, default=str)
    return hashlib.sha256(serialised.encode("utf-8")).hexdigest()


def hash_record(record: Dict) -> Dict:
    """
    Given a raw clinical trial record:
    - Hash every sensitive field individually
    - Return a privacy-safe record: public fields kept, sensitive fields → hashes
    - Add a combined data_hash for the entire record
    """
    safe_record = {}

    # Keep public fields as-is
    for field in PUBLIC_FIELDS:
        if field in record:
            safe_record[field] = record[field]

    # Hash each sensitive field separately
    hashed_fields = {}
    for field in SENSITIVE_FIELDS:
        if field in record:
            hashed_fields[f"{field}_hash"] = sha256_hash(record[field])

    safe_record.update(hashed_fields)

    # Combined hash for the full original record (used for tamper detection)
    safe_record["data_hash"] = sha256_hash(record)

    return safe_record


def hash_batch(records: List[Dict]) -> List[Dict]:
    """Hash a list of records."""
    return [hash_record(r) for r in records]


# ─────────────────────────────────────────────
# Avalanche Effect Demonstration
# ─────────────────────────────────────────────

def _bit_string(hex_digest: str) -> str:
    """Convert hex digest to binary string."""
    n = int(hex_digest, 16)
    return bin(n)[2:].zfill(256)


def avalanche_demo(original: str, modified: str) -> Dict:
    """
    Demonstrates the SHA-256 avalanche effect.
    Even a 1-character difference should flip ~50% of output bits.
    """
    h1 = sha256_hash(original)
    h2 = sha256_hash(modified)

    b1 = _bit_string(h1)
    b2 = _bit_string(h2)

    differing_bits = sum(c1 != c2 for c1, c2 in zip(b1, b2))
    percentage = differing_bits / 256 * 100

    return {
        "original_input":  original,
        "modified_input":  modified,
        "original_hash":   h1,
        "modified_hash":   h2,
        "differing_bits":  differing_bits,
        "total_bits":      256,
        "bit_diff_pct":    round(percentage, 2),
        "avalanche_ok":    percentage >= 30,  # ≥30% flip is a strong avalanche
    }


# ─────────────────────────────────────────────
# Tamper Detection / Hash Verification
# ─────────────────────────────────────────────

def verify_record(raw_record: Dict, stored_hash: str) -> Dict:
    """
    Given raw data and a previously stored hash, verify integrity.
    Returns a dict with status (VALID | TAMPERED) and details.
    """
    computed_hash = sha256_hash(raw_record)
    is_valid = computed_hash == stored_hash

    return {
        "status":         "VALID" if is_valid else "TAMPERED",
        "computed_hash":  computed_hash,
        "stored_hash":    stored_hash,
        "match":          is_valid,
    }


def build_merkle_root(hashes: List[str]) -> str:
    """
    Compute Merkle root from a list of transaction hashes.
    If odd number, duplicate the last element.
    """
    if not hashes:
        return sha256_hash("")
    layer = hashes[:]
    while len(layer) > 1:
        if len(layer) % 2 == 1:
            layer.append(layer[-1])
        layer = [
            sha256_hash(layer[i] + layer[i + 1])
            for i in range(0, len(layer), 2)
        ]
    return layer[0]


# ─────────────────────────────────────────────
# Quick self-test
# ─────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 60)
    print("SHA-256 Hashing Module — Self Test")
    print("=" * 60)

    sample = {
        "trial_id": "NCT03000001",
        "patient_id": "PAT-010001",
        "age_group": "36-50",
        "drug_name": "Metformin",
        "dosage_level_mg": 250.0,
        "phase": "II",
        "response_time_days": 90,
        "adverse_event": "Mild",
        "adverse_event_flag": 1,
        "consent_hash": "abc123",
        "timestamp": "2023-06-15T08:00:00Z",
        "node_id": "NODE-01",
        "manipulated": 0,
    }

    hashed = hash_record(sample)
    print("\n📦 Hashed Record (on-chain safe):")
    for k, v in hashed.items():
        print(f"  {k}: {v}")

    print("\n🌊 Avalanche Effect Demo:")
    demo = avalanche_demo("Metformin:250mg:PAT-010001", "Metformin:251mg:PAT-010001")
    for k, v in demo.items():
        print(f"  {k}: {v}")

    print("\n🔍 Tamper Detection:")
    stored = hashed["data_hash"]
    result = verify_record(sample, stored)
    print(f"  Status: {result['status']}")
    tampered = dict(sample, dosage_level_mg=999.0)
    result2 = verify_record(tampered, stored)
    print(f"  After tampering — Status: {result2['status']}")

    print("\n🌳 Merkle Root Demo:")
    test_hashes = [sha256_hash(f"tx_{i}") for i in range(5)]
    root = build_merkle_root(test_hashes)
    print(f"  Merkle Root: {root}")
    print("=" * 60)
