"""
Step 12: AI-Driven Governance Module
- Monitor network health, transaction approval times, ML model drift
- Auto-adjust trust scores and consensus parameters
- Feedback loop: Governance AI → node reputation → consensus weight
"""
import time, statistics, math
from dataclasses import dataclass, field
from typing import Dict, List, Optional
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from backend.nodes import NodeRegistry


# ──────────────────────────────────────────────────────────────
# Data structures
# ──────────────────────────────────────────────────────────────

@dataclass
class NetworkSnapshot:
    timestamp:         float
    pending_tx_count:  int
    avg_approval_ms:   float
    tps:               float
    model_accuracy:    float      # live XGBoost accuracy on recent batch
    node_stats:        Dict       # node_id → {validated, rejected, rep}


@dataclass
class GovernanceAction:
    action_type:   str          # REPUTATION_ADJUST | THRESHOLD_CHANGE | ALERT
    target_node:   Optional[str]
    delta:         float
    reason:        str
    timestamp:     float = field(default_factory=time.time)


# ──────────────────────────────────────────────────────────────
# Governance Engine
# ──────────────────────────────────────────────────────────────

class GovernanceEngine:
    """
    AI-driven governance — rule-based + statistical anomaly detection.

    Rules:
      1. Node error rate > 20% → reputation penalty
      2. Node error rate < 2%  → reputation bonus
      3. Average approval time > 2000 ms → lower consensus threshold
      4. TPS drops > 50% from baseline → emit ALERT
      5. ML accuracy drops > 5% from baseline → trigger retraining flag
    """

    APPROVAL_MS_THRESHOLD   = 2000.0   # ms — above this: slow network
    ERROR_RATE_HIGH         = 0.20     # 20% rejection rate → penalize
    ERROR_RATE_LOW          = 0.02     # 2% rejection rate → reward
    REPUTATION_PENALTY      = -5.0
    REPUTATION_BONUS        = +2.0
    TPS_DROP_ALERT_FRACTION = 0.50     # alert if TPS drops 50%
    ML_DRIFT_THRESHOLD      = 5.0     # accuracy % points

    def __init__(self, registry: NodeRegistry, baseline_tps: float = 10.0,
                 baseline_accuracy: float = 94.1):
        self.registry           = registry
        self.baseline_tps       = baseline_tps
        self.baseline_accuracy  = baseline_accuracy
        self.snapshots:  List[NetworkSnapshot]  = []
        self.actions:    List[GovernanceAction] = []
        self.consensus_threshold: float = 0.67   # default supermajority
        self.retrain_flag: bool = False

    # ── Record snapshot ──────────────────────────────────────

    def record_snapshot(
        self,
        pending_tx: int,
        avg_approval_ms: float,
        tps: float,
        model_accuracy: float,
        node_stats: Dict,
    ) -> List[GovernanceAction]:
        snap = NetworkSnapshot(
            timestamp        = time.time(),
            pending_tx_count = pending_tx,
            avg_approval_ms  = avg_approval_ms,
            tps              = tps,
            model_accuracy   = model_accuracy,
            node_stats       = node_stats,
        )
        self.snapshots.append(snap)
        actions = self._evaluate(snap)
        self.actions.extend(actions)
        return actions

    # ── Evaluation rules ─────────────────────────────────────

    def _evaluate(self, snap: NetworkSnapshot) -> List[GovernanceAction]:
        actions = []

        # Rule 1 & 2: Per-node error rate
        for node_id, stats in snap.node_stats.items():
            validated = stats.get("validated", 0)
            rejected  = stats.get("rejected", 0)
            total     = validated + rejected
            if total == 0:
                continue
            error_rate = rejected / total

            if error_rate > self.ERROR_RATE_HIGH:
                new_rep = self.registry.update_reputation(node_id, self.REPUTATION_PENALTY)
                actions.append(GovernanceAction(
                    action_type  = "REPUTATION_ADJUST",
                    target_node  = node_id,
                    delta        = self.REPUTATION_PENALTY,
                    reason       = f"High error rate {error_rate:.1%} > {self.ERROR_RATE_HIGH:.0%}",
                ))
            elif error_rate < self.ERROR_RATE_LOW and validated > 10:
                new_rep = self.registry.update_reputation(node_id, self.REPUTATION_BONUS)
                actions.append(GovernanceAction(
                    action_type  = "REPUTATION_ADJUST",
                    target_node  = node_id,
                    delta        = self.REPUTATION_BONUS,
                    reason       = f"Low error rate {error_rate:.1%} < {self.ERROR_RATE_LOW:.0%}",
                ))

        # Rule 3: Slow approval → lower consensus threshold
        if snap.avg_approval_ms > self.APPROVAL_MS_THRESHOLD:
            old = self.consensus_threshold
            self.consensus_threshold = max(0.51, self.consensus_threshold - 0.02)
            actions.append(GovernanceAction(
                action_type  = "THRESHOLD_CHANGE",
                target_node  = None,
                delta        = self.consensus_threshold - old,
                reason       = f"Avg approval {snap.avg_approval_ms:.0f} ms exceeds {self.APPROVAL_MS_THRESHOLD} ms",
            ))

        # Rule 4: TPS drop alert
        if snap.tps < self.baseline_tps * (1 - self.TPS_DROP_ALERT_FRACTION):
            actions.append(GovernanceAction(
                action_type  = "ALERT",
                target_node  = None,
                delta        = 0,
                reason       = f"TPS {snap.tps:.2f} dropped >50% below baseline {self.baseline_tps}",
            ))

        # Rule 5: ML drift → flag retraining
        drift = self.baseline_accuracy - snap.model_accuracy
        if drift > self.ML_DRIFT_THRESHOLD:
            self.retrain_flag = True
            actions.append(GovernanceAction(
                action_type  = "ALERT",
                target_node  = None,
                delta        = -drift,
                reason       = f"ML accuracy drift {drift:.1f}% — retraining recommended",
            ))

        return actions

    # ── Reporting ────────────────────────────────────────────

    def health_report(self) -> Dict:
        base = {
            "snapshot_count":      len(self.snapshots),
            "latest_tps":          None,
            "latest_approval_ms":  None,
            "latest_ml_accuracy":  None,
            "pending_txs":         0,
            "consensus_threshold": self.consensus_threshold,
            "retrain_flag":        self.retrain_flag,
            "total_actions":       len(self.actions),
            "node_reputations": {
                n["node_id"]: n["reputation_score"]
                for n in self.registry.list_nodes()
            },
        }
        if not self.snapshots:
            return base   # Return defaults — never "No data"
        latest = self.snapshots[-1]
        base.update({
            "latest_tps":         latest.tps,
            "latest_approval_ms": latest.avg_approval_ms,
            "latest_ml_accuracy": latest.model_accuracy,
            "pending_txs":        latest.pending_tx_count,
        })
        return base


    def recent_actions(self, n: int = 10) -> List[dict]:
        from dataclasses import asdict
        return [asdict(a) for a in self.actions[-n:]]


# ──────────────────────────────────────────────────────────────
# Self-test
# ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    from backend.nodes import seed_network

    reg = NodeRegistry()
    seed_network(reg)
    gov = GovernanceEngine(reg, baseline_tps=10.0, baseline_accuracy=94.1)

    print("="*60)
    print("AI Governance Engine — Self Test")
    print("="*60)

    # Simulate 3 monitoring cycles
    scenarios = [
        dict(pending_tx=12, avg_approval_ms=800, tps=9.5, model_accuracy=93.8,
             node_stats={"NODE-01":{"validated":100,"rejected":1},
                         "NODE-04":{"validated":50,"rejected":15}}),
        dict(pending_tx=40, avg_approval_ms=2500, tps=4.0, model_accuracy=88.0,
             node_stats={"NODE-01":{"validated":120,"rejected":1},
                         "NODE-04":{"validated":60,"rejected":20}}),
        dict(pending_tx=5, avg_approval_ms=600, tps=11.0, model_accuracy=94.5,
             node_stats={"NODE-01":{"validated":150,"rejected":2},
                         "NODE-03":{"validated":80,"rejected":0}}),
    ]

    for i, s in enumerate(scenarios, 1):
        print(f"\n📡 Cycle {i}:")
        acts = gov.record_snapshot(**s)
        for a in acts:
            print(f"  [{a.action_type}] target={a.target_node} Δ={a.delta:+.1f} | {a.reason}")

    print("\n📊 Health Report:")
    for k, v in gov.health_report().items():
        print(f"  {k}: {v}")
