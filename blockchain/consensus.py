"""
Step 7 & 8: Trust-Based Consensus (PoA / DPoS)
- Reputation-weighted voting
- Proof of Authority with trusted clinical entities
- Feedback loop for governance AI
"""
import hashlib, json, time, math
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Optional
from backend.nodes import Node, NodeRegistry, NodeRole


# ──────────────────────────────────────────────────────────────
# Vote
# ──────────────────────────────────────────────────────────────

@dataclass
class Vote:
    voter_id:  str
    approve:   bool
    weight:    float
    signature: str
    timestamp: float = field(default_factory=time.time)


# ──────────────────────────────────────────────────────────────
# PoA Consensus Round
# ──────────────────────────────────────────────────────────────

class PoAConsensus:
    """
    Proof-of-Authority consensus with reputation-weighted voting.

    Quorum threshold: weighted_approvals / total_weight >= THRESHOLD
    Default threshold: 0.67 (supermajority)
    """
    THRESHOLD = 0.67

    def __init__(self, registry: NodeRegistry):
        self.registry = registry
        self._rounds: Dict[str, dict] = {}   # block_proposal_id → round state

    def propose_block(self, proposer_id: str, block_data: dict) -> str:
        """Proposer starts a new consensus round for a block."""
        proposer = self.registry.get(proposer_id)
        if proposer is None or not proposer.active:
            raise ValueError(f"Proposer {proposer_id} not found or inactive")
        if not proposer.has_permission("vote_consensus"):
            raise PermissionError(f"{proposer_id} cannot propose blocks")

        block_hash = hashlib.sha256(
            json.dumps(block_data, sort_keys=True, default=str).encode()
        ).hexdigest()

        self._rounds[block_hash] = {
            "block_data":   block_data,
            "proposer_id":  proposer_id,
            "votes":        [],
            "status":       "OPEN",
            "created_at":   time.time(),
        }
        return block_hash

    def cast_vote(self, voter_id: str, block_hash: str, approve: bool) -> dict:
        """A node casts a vote on a proposed block."""
        if block_hash not in self._rounds:
            return {"success": False, "reason": "Round not found"}

        rnd = self._rounds[block_hash]
        if rnd["status"] != "OPEN":
            return {"success": False, "reason": f"Round is {rnd['status']}"}

        voter = self.registry.get(voter_id)
        if voter is None or not voter.active:
            return {"success": False, "reason": "Voter inactive"}
        if not voter.has_permission("vote_consensus"):
            return {"success": False, "reason": "No consensus permission"}
        if voter.consensus_weight() == 0:
            return {"success": False, "reason": "Voter has zero weight (low reputation)"}

        # Prevent double-voting
        if any(v.voter_id == voter_id for v in rnd["votes"]):
            return {"success": False, "reason": "Already voted"}

        sig = voter.sign(block_hash + str(approve))
        vote = Vote(voter_id=voter_id, approve=approve,
                    weight=voter.consensus_weight(), signature=sig)
        rnd["votes"].append(vote)

        return {"success": True, "voter": voter_id, "approve": approve,
                "weight": vote.weight}

    def finalize(self, block_hash: str) -> dict:
        """Tally votes and decide ACCEPTED / REJECTED."""
        if block_hash not in self._rounds:
            return {"result": "ERROR", "reason": "Round not found"}

        rnd = self._rounds[block_hash]
        if rnd["status"] != "OPEN":
            return {"result": rnd["status"], "block_hash": block_hash}

        validators = self.registry.get_validators()
        total_weight = sum(v.consensus_weight() for v in validators)

        approve_weight = sum(v.weight for v in rnd["votes"] if v.approve)
        reject_weight  = sum(v.weight for v in rnd["votes"] if not v.approve)
        votes_cast     = len(rnd["votes"])

        ratio = approve_weight / total_weight if total_weight > 0 else 0
        accepted = ratio >= self.THRESHOLD

        rnd["status"] = "ACCEPTED" if accepted else "REJECTED"
        rnd["approve_weight"]  = approve_weight
        rnd["reject_weight"]   = reject_weight
        rnd["total_weight"]    = total_weight
        rnd["approval_ratio"]  = round(ratio, 4)
        rnd["votes_cast"]      = votes_cast
        rnd["finalized_at"]    = time.time()

        # Update node reputations
        for vote in rnd["votes"]:
            delta = +1.0 if (vote.approve == accepted) else -2.0
            self.registry.update_reputation(vote.voter_id, delta)

        return {
            "result":         rnd["status"],
            "block_hash":     block_hash,
            "approval_ratio": rnd["approval_ratio"],
            "approve_weight": approve_weight,
            "total_weight":   total_weight,
            "votes_cast":     votes_cast,
        }

    def get_round(self, block_hash: str) -> Optional[dict]:
        rnd = self._rounds.get(block_hash)
        if not rnd:
            return None
        summary = {k: v for k, v in rnd.items() if k != "votes"}
        summary["votes"] = [asdict(v) for v in rnd["votes"]]
        return summary


# ──────────────────────────────────────────────────────────────
# DPoS Delegate Election (optional extension)
# ──────────────────────────────────────────────────────────────

class DPoSElection:
    """Simplified Delegated Proof-of-Stake delegate election."""

    def __init__(self, registry: NodeRegistry, num_delegates: int = 3):
        self.registry      = registry
        self.num_delegates = num_delegates
        self.delegates: List[str] = []

    def elect(self) -> List[str]:
        """Elect top-N validators by reputation score."""
        validators = self.registry.get_validators()
        sorted_v   = sorted(validators, key=lambda n: n.reputation_score, reverse=True)
        self.delegates = [n.node_id for n in sorted_v[:self.num_delegates]]
        return self.delegates

    def is_delegate(self, node_id: str) -> bool:
        return node_id in self.delegates


# ──────────────────────────────────────────────────────────────
# Self-test
# ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    from backend.nodes import seed_network

    reg = NodeRegistry()
    seed_network(reg)
    consensus = PoAConsensus(reg)

    print("="*60)
    print("PoA Consensus — Self Test")
    print("="*60)

    block_data = {"block_idx": 1, "merkle_root": "abc123", "tx_count": 5}
    bh = consensus.propose_block("NODE-01", block_data)
    print(f"\nBlock proposed: {bh[:16]}…")

    for voter in ["NODE-01","NODE-02","NODE-03","NODE-04"]:
        approve = voter != "NODE-04"   # NODE-04 (low rep) votes No
        r = consensus.cast_vote(voter, bh, approve)
        print(f"  Vote from {voter}: approve={approve} → {r}")

    result = consensus.finalize(bh)
    print(f"\nFinalization: {result}")

    print("\nDPoS Election:")
    dpos = DPoSElection(reg, num_delegates=3)
    delegates = dpos.elect()
    print(f"  Elected delegates: {delegates}")
