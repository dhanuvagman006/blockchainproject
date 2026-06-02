"""
Step 9: Private Blockchain Core
- Block structure with Merkle root and validator signature
- Chain immutability demonstration
- In-memory chain with append/verify operations
"""
import hashlib, json, time
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Optional

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from backend.hashing import sha256_hash, build_merkle_root


# ──────────────────────────────────────────────────────────────
# Block
# ──────────────────────────────────────────────────────────────

@dataclass
class Block:
    index:          int
    previous_hash:  str
    merkle_root:    str
    timestamp:      float
    transactions:   List[dict]
    validator_id:   str
    validator_sig:  str
    nonce:          int = 0

    @property
    def block_hash(self) -> str:
        payload = json.dumps({
            "index":         self.index,
            "previous_hash": self.previous_hash,
            "merkle_root":   self.merkle_root,
            "timestamp":     self.timestamp,
            "validator_id":  self.validator_id,
            "nonce":         self.nonce,
        }, sort_keys=True)
        return hashlib.sha256(payload.encode()).hexdigest()

    def to_dict(self) -> dict:
        d = asdict(self)
        d["block_hash"] = self.block_hash
        return d


# ──────────────────────────────────────────────────────────────
# Blockchain
# ──────────────────────────────────────────────────────────────

class Blockchain:
    def __init__(self):
        self.chain: List[Block] = []
        self._create_genesis()

    def _create_genesis(self):
        genesis = Block(
            index=0,
            previous_hash="0" * 64,
            merkle_root=sha256_hash("GENESIS"),
            timestamp=time.time(),
            transactions=[],
            validator_id="GENESIS",
            validator_sig="0" * 64,
        )
        self.chain.append(genesis)

    # ── Append ────────────────────────────────────────────────

    def append_block(
        self,
        transactions: List[dict],
        validator_id: str,
        validator_sig: str,
    ) -> Block:
        """Create and append a new block."""
        prev = self.chain[-1]
        tx_hashes = [sha256_hash(tx) for tx in transactions]
        merkle    = build_merkle_root(tx_hashes)

        block = Block(
            index         = len(self.chain),
            previous_hash = prev.block_hash,
            merkle_root   = merkle,
            timestamp     = time.time(),
            transactions  = transactions,
            validator_id  = validator_id,
            validator_sig = validator_sig,
        )
        self.chain.append(block)
        return block

    # ── Verification ─────────────────────────────────────────

    def verify_chain(self) -> dict:
        """Full chain integrity check."""
        errors = []
        for i in range(1, len(self.chain)):
            curr = self.chain[i]
            prev = self.chain[i - 1]

            if curr.previous_hash != prev.block_hash:
                errors.append({
                    "block": i,
                    "error": "previous_hash mismatch",
                    "expected": prev.block_hash[:16] + "…",
                    "got":      curr.previous_hash[:16] + "…",
                })

            # Re-compute Merkle root
            tx_hashes = [sha256_hash(tx) for tx in curr.transactions]
            expected_merkle = build_merkle_root(tx_hashes)
            if curr.merkle_root != expected_merkle:
                errors.append({
                    "block": i,
                    "error": "merkle_root mismatch (data tampered)",
                })

        return {
            "valid":       len(errors) == 0,
            "chain_length": len(self.chain),
            "errors":      errors,
        }

    def tamper_demo(self, block_index: int, field: str, new_value) -> dict:
        """
        Modifies a block to demonstrate immutability.
        Returns the verification result after tampering.
        """
        if block_index >= len(self.chain) or block_index == 0:
            return {"error": "Invalid block index"}

        original = getattr(self.chain[block_index], field, None)
        setattr(self.chain[block_index], field, new_value)
        verification = self.verify_chain()
        # Restore
        setattr(self.chain[block_index], field, original)
        return {
            "tampered_block": block_index,
            "tampered_field": field,
            "verification":   verification,
        }

    # ── Accessors ────────────────────────────────────────────

    def get_block(self, index: int) -> Optional[dict]:
        if 0 <= index < len(self.chain):
            return self.chain[index].to_dict()
        return None

    def get_chain_summary(self) -> List[dict]:
        return [
            {
                "index":         b.index,
                "block_hash":    b.block_hash[:20] + "…",
                "previous_hash": b.previous_hash[:20] + "…",
                "tx_count":      len(b.transactions),
                "validator_id":  b.validator_id,
                "timestamp":     b.timestamp,
            }
            for b in self.chain
        ]

    def __len__(self):
        return len(self.chain)


# ──────────────────────────────────────────────────────────────
# Self-test
# ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    bc = Blockchain()

    for i in range(3):
        txs = [{"trial_id": f"NCT{i}{j}", "data_hash": sha256_hash(f"record_{i}_{j}")}
               for j in range(3)]
        sig = hashlib.sha256(f"validator_NODE-01_block{i}".encode()).hexdigest()
        bc.append_block(txs, "NODE-01", sig)

    print("="*60)
    print("Blockchain — Self Test")
    print("="*60)
    print("\nChain summary:")
    for b in bc.get_chain_summary():
        print(f"  Block {b['index']}: {b['block_hash']} | TXs={b['tx_count']}")

    print("\nChain verification:", bc.verify_chain())

    print("\nTamper demonstration:")
    demo = bc.tamper_demo(1, "merkle_root", "0"*64)
    print(f"  Tampering block 1 → valid={demo['verification']['valid']}")
    print(f"  Errors: {demo['verification']['errors']}")

    print("\nChain verification after restore:", bc.verify_chain()["valid"])
