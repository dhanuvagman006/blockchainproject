"""
Step 3: Transaction Creation & Mempool
- Creates structured transaction objects
- Mempool for pending transactions
- Transaction broadcasting and verification
"""
import hashlib
import json
import time
import uuid
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Optional
from datetime import datetime


# ─────────────────────────────────────────────
# Transaction Model
# ─────────────────────────────────────────────

@dataclass
class Transaction:
    trial_id:    str
    node_id:     str
    data_hash:   str
    ipfs_cid:    str
    metadata:    Dict
    tx_id:       str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp:   str = field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")
    signature:   Optional[str] = None
    status:      str = "PENDING"          # PENDING | VALID | REJECTED
    ml_result:   Optional[str] = None     # VALID | MANIPULATED
    ml_confidence: Optional[float] = None

    def to_dict(self) -> Dict:
        return asdict(self)

    def compute_tx_hash(self) -> str:
        """Deterministic hash of the transaction content."""
        payload = json.dumps({
            "tx_id":     self.tx_id,
            "trial_id":  self.trial_id,
            "node_id":   self.node_id,
            "data_hash": self.data_hash,
            "timestamp": self.timestamp,
        }, sort_keys=True)
        return hashlib.sha256(payload.encode()).hexdigest()

    def sign(self, private_key_hex: str) -> None:
        """Simple HMAC-based signature (real impl uses ECDSA)."""
        import hmac
        msg = self.compute_tx_hash().encode()
        key = bytes.fromhex(private_key_hex.ljust(64, "0")[:64])
        self.signature = hmac.new(key, msg, hashlib.sha256).hexdigest()

    def verify_format(self) -> tuple[bool, str]:
        """Validate that the transaction has all required, non-empty fields."""
        required = ["trial_id", "node_id", "data_hash", "timestamp"]
        for f in required:
            val = getattr(self, f, None)
            if not val:
                return False, f"Missing required field: {f}"
        if len(self.data_hash) != 64:
            return False, "data_hash must be a 64-char hex SHA-256 digest"
        return True, "OK"


# ─────────────────────────────────────────────
# Mempool (in-memory transaction pool)
# ─────────────────────────────────────────────

class Mempool:
    def __init__(self, max_size: int = 500):
        self.pending: List[Transaction] = []
        self.confirmed: List[Transaction] = []
        self.rejected: List[Transaction] = []
        self.max_size = max_size

    def submit(self, tx: Transaction) -> Dict:
        """Add a transaction to the mempool after format validation."""
        if len(self.pending) >= self.max_size:
            return {"accepted": False, "reason": "Mempool full"}

        valid, reason = tx.verify_format()
        if not valid:
            tx.status = "REJECTED"
            self.rejected.append(tx)
            return {"accepted": False, "reason": reason, "tx_id": tx.tx_id}

        self.pending.append(tx)
        return {"accepted": True, "tx_id": tx.tx_id, "status": "PENDING"}

    def get_pending(self) -> List[Dict]:
        return [tx.to_dict() for tx in self.pending]

    def confirm(self, tx_id: str) -> bool:
        for tx in self.pending:
            if tx.tx_id == tx_id:
                tx.status = "CONFIRMED"
                self.confirmed.append(tx)
                self.pending.remove(tx)
                return True
        return False

    def reject(self, tx_id: str, reason: str = "") -> bool:
        for tx in self.pending:
            if tx.tx_id == tx_id:
                tx.status = "REJECTED"
                self.rejected.append(tx)
                self.pending.remove(tx)
                return True
        return False

    def stats(self) -> Dict:
        return {
            "pending":   len(self.pending),
            "confirmed": len(self.confirmed),
            "rejected":  len(self.rejected),
            "total":     len(self.pending) + len(self.confirmed) + len(self.rejected),
        }

    def drain_batch(self, size: int = 10) -> List[Transaction]:
        """Pop up to `size` pending transactions for block inclusion."""
        batch = self.pending[:size]
        self.pending = self.pending[size:]
        return batch


# ─────────────────────────────────────────────
# Transaction Factory
# ─────────────────────────────────────────────

def create_transaction(
    trial_id: str,
    node_id: str,
    data_hash: str,
    ipfs_cid: str,
    metadata: Optional[Dict] = None,
    private_key_hex: Optional[str] = None,
) -> Transaction:
    """Factory function to build and optionally sign a transaction."""
    tx = Transaction(
        trial_id=trial_id,
        node_id=node_id,
        data_hash=data_hash,
        ipfs_cid=ipfs_cid,
        metadata=metadata or {},
    )
    if private_key_hex:
        tx.sign(private_key_hex)
    return tx


# ─────────────────────────────────────────────
# Self-test
# ─────────────────────────────────────────────

if __name__ == "__main__":
    import random, hashlib as _h

    pool = Mempool()
    for i in range(5):
        dummy_hash = _h.sha256(f"record_{i}".encode()).hexdigest()
        tx = create_transaction(
            trial_id=f"NCT0300000{i}",
            node_id="NODE-01",
            data_hash=dummy_hash,
            ipfs_cid=f"QmFake{i}",
            metadata={"phase": "II", "drug": "Metformin"},
            private_key_hex="deadbeef" * 8,
        )
        result = pool.submit(tx)
        print(f"  TX {i}: {result}")

    print("\nMempool stats:", pool.stats())
    print("Pending TXs:")
    for t in pool.get_pending():
        print(f"  {t['tx_id'][:8]}… | status={t['status']} | node={t['node_id']}")
