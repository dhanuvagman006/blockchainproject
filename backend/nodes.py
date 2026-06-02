"""
Step 4: Role-Based Node Participation
- Three node roles: Protocol Validator, Consent Verifier, Compliance Auditor
- Each node has a reputation score and private key
- RBAC enforcement
"""
import hashlib
import json
import secrets
import time
from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Dict, List, Optional


# ─────────────────────────────────────────────
# Role Definitions
# ─────────────────────────────────────────────

class NodeRole(str, Enum):
    PROTOCOL_VALIDATOR  = "PROTOCOL_VALIDATOR"   # Validates trial methodology
    CONSENT_VERIFIER    = "CONSENT_VERIFIER"     # Verifies patient consent / ZKPs
    COMPLIANCE_AUDITOR  = "COMPLIANCE_AUDITOR"   # Read-only: HIPAA/GDPR/GCP check


ROLE_PERMISSIONS: Dict[NodeRole, List[str]] = {
    NodeRole.PROTOCOL_VALIDATOR: [
        "read_transaction",
        "validate_transaction",
        "sign_block",
        "vote_consensus",
    ],
    NodeRole.CONSENT_VERIFIER: [
        "read_transaction",
        "verify_consent",
        "validate_transaction",
        "sign_block",
        "vote_consensus",
    ],
    NodeRole.COMPLIANCE_AUDITOR: [
        "read_transaction",
        "read_block",
        "read_audit_log",
    ],
}


# ─────────────────────────────────────────────
# Node Model
# ─────────────────────────────────────────────

@dataclass
class Node:
    node_id:          str
    role:             NodeRole
    organization:     str
    reputation_score: float = 100.0       # 0–100
    accuracy_score:   float = 100.0       # ML classification accuracy %
    private_key:      str   = field(default_factory=lambda: secrets.token_hex(32))
    active:           bool  = True
    validated_count:  int   = 0
    rejected_count:   int   = 0
    created_at:       str   = field(default_factory=lambda: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))

    @property
    def public_key(self) -> str:
        """Derive a deterministic public key from the private key (simplified)."""
        return hashlib.sha256(self.private_key.encode()).hexdigest()

    def has_permission(self, action: str) -> bool:
        return action in ROLE_PERMISSIONS.get(self.role, [])

    def sign(self, data: str) -> str:
        """HMAC-SHA256 signature using node private key."""
        import hmac
        key = bytes.fromhex(self.private_key)
        return hmac.new(key, data.encode(), hashlib.sha256).hexdigest()

    def update_reputation(self, delta: float) -> None:
        self.reputation_score = max(0.0, min(100.0, self.reputation_score + delta))

    def consensus_weight(self) -> float:
        """
        Higher reputation = higher vote weight in PoA/DPoS.
        Nodes with <50 reputation get 0 weight (excluded from consensus).
        """
        if self.reputation_score < 50:
            return 0.0
        return self.reputation_score / 100.0

    def to_dict(self) -> Dict:
        d = asdict(self)
        d["public_key"]        = self.public_key
        d["consensus_weight"]  = self.consensus_weight()
        d["permissions"]       = ROLE_PERMISSIONS[self.role]
        del d["private_key"]   # Never expose private key in serialised form
        return d


# ─────────────────────────────────────────────
# Node Registry (in-memory)
# ─────────────────────────────────────────────

class NodeRegistry:
    def __init__(self):
        self._nodes: Dict[str, Node] = {}

    def register(self, node: Node) -> Dict:
        if node.node_id in self._nodes:
            return {"success": False, "reason": f"Node {node.node_id} already registered"}
        self._nodes[node.node_id] = node
        return {"success": True, "node_id": node.node_id, "role": node.role}

    def get(self, node_id: str) -> Optional[Node]:
        return self._nodes.get(node_id)

    def list_nodes(self, role: Optional[NodeRole] = None) -> List[Dict]:
        nodes = list(self._nodes.values())
        if role:
            nodes = [n for n in nodes if n.role == role]
        return [n.to_dict() for n in nodes]

    def check_permission(self, node_id: str, action: str) -> bool:
        node = self.get(node_id)
        return node is not None and node.active and node.has_permission(action)

    def deactivate(self, node_id: str) -> bool:
        node = self.get(node_id)
        if node:
            node.active = False
            return True
        return False

    def update_reputation(self, node_id: str, delta: float) -> Optional[float]:
        node = self.get(node_id)
        if node:
            node.update_reputation(delta)
            return node.reputation_score
        return None

    def get_validators(self) -> List[Node]:
        """Return active nodes eligible to vote in consensus."""
        return [
            n for n in self._nodes.values()
            if n.active and n.role in [NodeRole.PROTOCOL_VALIDATOR, NodeRole.CONSENT_VERIFIER]
            and n.consensus_weight() > 0
        ]

    def stats(self) -> Dict:
        all_nodes = list(self._nodes.values())
        return {
            "total":    len(all_nodes),
            "active":   sum(1 for n in all_nodes if n.active),
            "by_role": {
                role.value: sum(1 for n in all_nodes if n.role == role)
                for role in NodeRole
            },
            "avg_reputation": round(
                sum(n.reputation_score for n in all_nodes) / len(all_nodes), 2
            ) if all_nodes else 0,
        }


# ─────────────────────────────────────────────
# Seed network with default nodes
# ─────────────────────────────────────────────

def seed_network(registry: NodeRegistry) -> None:
    """Populate a registry with a representative default set of nodes."""
    defaults = [
        Node("NODE-01", NodeRole.PROTOCOL_VALIDATOR, "PharmaCorp-A",    reputation_score=97.0),
        Node("NODE-02", NodeRole.PROTOCOL_VALIDATOR, "MedResearch-B",   reputation_score=89.0),
        Node("NODE-03", NodeRole.CONSENT_VERIFIER,   "EthicsBoard-C",   reputation_score=95.0),
        Node("NODE-04", NodeRole.CONSENT_VERIFIER,   "HospitalNet-D",   reputation_score=65.0),
        Node("NODE-05", NodeRole.COMPLIANCE_AUDITOR, "RegulatoryFA-E",  reputation_score=100.0),
    ]
    for node in defaults:
        registry.register(node)


if __name__ == "__main__":
    reg = NodeRegistry()
    seed_network(reg)

    print("=" * 60)
    print("Node Registry — Self Test")
    print("=" * 60)
    print("\nRegistered nodes:")
    for n in reg.list_nodes():
        print(f"  {n['node_id']} | {n['role']:<25} | rep={n['reputation_score']} | weight={n['consensus_weight']:.2f}")

    print("\nPermission check (NODE-05 read_transaction):",
          reg.check_permission("NODE-05", "read_transaction"))
    print("Permission check (NODE-05 sign_block):",
          reg.check_permission("NODE-05", "sign_block"))

    print("\nStats:", reg.stats())
    print("\nValidators eligible for consensus:")
    for v in reg.get_validators():
        print(f"  {v.node_id} weight={v.consensus_weight():.2f}")
