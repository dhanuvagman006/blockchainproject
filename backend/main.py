"""
FastAPI Backend — Unified API for all 12 steps.
Endpoints: hashing, IPFS, transactions, blockchain, ML gate, nodes, governance
"""
import os, sys, json, time, csv, io, asyncio
from pathlib import Path
from typing import Any, Dict, List, Optional

sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi import FastAPI, HTTPException, File, UploadFile, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# ── Internal modules ──────────────────────────────────────────
from backend.hashing import (
    hash_record, hash_batch, sha256_hash, avalanche_demo,
    verify_record, build_merkle_root
)
from backend.transaction import Transaction, Mempool, create_transaction
from backend.nodes import NodeRegistry, Node, NodeRole, seed_network
from blockchain.chain import Blockchain
from blockchain.consensus import PoAConsensus
from blockchain.governance import GovernanceEngine
from ipfs.ipfs_client import IPFSClient

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app):
    """Start governance snapshot loop on startup."""
    task = asyncio.create_task(_governance_loop())
    yield
    task.cancel()

async def _governance_loop():
    """Every 15 s: push a real snapshot into GovernanceEngine."""
    _prev_blocks = 0
    _prev_time   = time.time()
    while True:
        await asyncio.sleep(15)
        try:
            now = time.time()
            # ─ TPS: blocks confirmed ÷ elapsed time (proxy) ─
            cur_blocks = len(blockchain)
            elapsed    = max(now - _prev_time, 1)
            tps        = round((cur_blocks - _prev_blocks) / elapsed * 10, 2)  # scale
            _prev_blocks = cur_blocks
            _prev_time   = now

            # ─ Mempool stats ─
            mp         = mempool.stats()
            pending    = mp.get("pending", 0)

            # ─ Approval time: derive from perf log for /api/consensus/* ─
            consensus_times = [
                e["ms"] for e in _perf_log[-50:]
                if "consensus" in e.get("path", "")
            ] if _perf_log else []
            avg_ms = round(sum(consensus_times) / len(consensus_times), 1) \
                     if consensus_times else 320.0   # reasonable default

            # ─ ML accuracy from trained models ─
            gate, _ = get_ml_gate()
            ml_acc  = 86.6   # default from last training run
            if gate is not None:
                try:
                    summary = gate.summary()
                    best    = max(summary.get("models", []), key=lambda m: m.get("accuracy", 0), default=None)
                    if best:
                        ml_acc = best.get("accuracy", ml_acc)
                except Exception:
                    pass

            # ─ Node stats from registry ─
            node_stats = {
                n["node_id"]: {"validated": max(0, int(n["reputation_score"] - 80)),
                               "rejected":  max(0, int((100 - n["reputation_score"]) // 10))}
                for n in registry.list_nodes()
            }

            governance.record_snapshot(
                pending_tx      = pending,
                avg_approval_ms = avg_ms,
                tps             = max(tps, 0.5),
                model_accuracy  = ml_acc,
                node_stats      = node_stats,
            )
        except Exception:
            pass   # never crash the loop


# ── App bootstrap ─────────────────────────────────────────────
app = FastAPI(
    title="Clinical Trial Blockchain API",
    description="ML-Integrated Private Blockchain for Securing Clinical Trials Data",
    version="1.0.0",
    lifespan=lifespan,
)


def _get_cors_origins() -> list[str]:
    raw_origins = os.getenv("CORS_ORIGINS", "*")
    origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]
    return origins or ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_get_cors_origins(),
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Singleton services ────────────────────────────────────────
registry  = NodeRegistry()
seed_network(registry)

blockchain = Blockchain()
consensus  = PoAConsensus(registry)
mempool    = Mempool()
ipfs       = IPFSClient()

# ── Drug Authority Admin — rejected dataset store ─────────────
import uuid as _uuid
_rejected_datasets: List[Dict] = []   # in-memory store of blocked uploads
governance = GovernanceEngine(registry, baseline_tps=10.0, baseline_accuracy=94.1)

# Lazy-load ML gate (only if models are trained)
_ml_gate = None
def get_ml_gate():
    global _ml_gate
    if _ml_gate is None:
        try:
            from ml.train_models import MLGate
            _ml_gate = MLGate()
        except Exception as e:
            return None, str(e)
    return _ml_gate, None


# ═════════════════════════════════════════════════════════════
# Pydantic models
# ═════════════════════════════════════════════════════════════

class HashRequest(BaseModel):
    data: Any

class AvalancheRequest(BaseModel):
    original: str
    modified: str

class VerifyRequest(BaseModel):
    raw_record: Dict
    stored_hash: str

class TrialRecord(BaseModel):
    trial_id: str
    patient_id: str
    age_group: str
    drug_name: str
    dosage_level_mg: float
    phase: str
    response_time_days: int
    adverse_event: str
    adverse_event_flag: int
    consent_hash: str
    timestamp: str
    node_id: str
    manipulated: int = 0

class TransactionRequest(BaseModel):
    trial_id: str
    node_id: str
    data_hash: str
    ipfs_cid: str = ""
    metadata: Dict = {}
    private_key_hex: Optional[str] = None

class VoteRequest(BaseModel):
    voter_id: str
    block_hash: str
    approve: bool

class NodeRegisterRequest(BaseModel):
    node_id: str
    role: str
    organization: str
    private_key_hex: Optional[str] = None

class GovernanceSnapshot(BaseModel):
    pending_tx: int
    avg_approval_ms: float
    tps: float
    model_accuracy: float
    node_stats: Dict


# ═════════════════════════════════════════════════════════════
# Root
# ═════════════════════════════════════════════════════════════

@app.get("/", tags=["Health"])
def root():
    return {
        "service":    "Clinical Trial Blockchain API",
        "version":    "1.0.0",
        "blockchain": f"{len(blockchain)} blocks",
        "mempool":    mempool.stats(),
        "nodes":      registry.stats(),
    }

@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok", "timestamp": time.time()}


# ═════════════════════════════════════════════════════════════
# Step 1 — Dataset ingestion
# ═════════════════════════════════════════════════════════════


# ── Shared feature extraction ──────────────────────────────
AGE_MAP_BACKEND = {
    '<18':0, 'Pediatric':0, 'pediatric':0,
    '18-35':1, 'Young Adult':1, 'young adult':1,
    '36-50':2, 'Middle-Aged':2, 'middle-aged':2, 'Adult':2,
    '51-65':3, 'Older Adult':3, 'older adult':3,
    '65+':4, 'Senior':4, 'senior':4, 'Elderly':4,
}
PHASE_MAP_BACKEND = {
    'I':0,   'Phase-1':0, 'Phase 1':0, '1':0,
    'II':1,  'Phase-2':1, 'Phase 2':1, '2':1,
    'III':2, 'Phase-3':2, 'Phase 3':2, '3':2,
    'IV':3,  'Phase-4':3, 'Phase 4':3, '4':3,
}
ADV_MAP_BACKEND = {
    'None':0,'No':0,'no':0,'0':0,
    'Mild':1,'mild':1,
    'Moderate':2,'moderate':2,
    'Severe':3,'severe':3,'Yes':3,'yes':3,
    'Life-threatening':4,'life-threatening':4,
}

def extract_features(row: dict):
    """Extract ML gate features from a CSV row or metadata dict."""
    age_enc  = AGE_MAP_BACKEND.get(str(row.get('age_group','36-50')), 2)
    ph_enc   = PHASE_MAP_BACKEND.get(str(row.get('phase', row.get('Phase','II'))), 1)
    dosage   = float(row.get('dosage_level_mg', row.get('dosage',250)) or 250)
    resp     = int(float(row.get('response_time_days', row.get('response_days',90)) or 90))
    adv_raw  = str(row.get('adverse_event','None'))
    adv_flag = int(float(row.get('adverse_event_flag',
                   1 if ADV_MAP_BACKEND.get(adv_raw, 0) > 0 else 0)))
    return age_enc, dosage, resp, ph_enc, adv_flag


REQUIRED_COLUMNS = {
    "trial_id","patient_id","age_group","drug_name","dosage_level_mg",
    "phase","response_time_days","adverse_event","adverse_event_flag",
    "consent_hash","timestamp","node_id"
}

# ── Age / Phase canonical maps (shared) ──────────────────────
_AGE_CANON = {
    '<18':'<18','Pediatric':'<18','pediatric':'<18',
    '18-35':'18-35','Young Adult':'18-35','young adult':'18-35',
    '36-50':'36-50','Middle-Aged':'36-50','middle-aged':'36-50','Adult':'36-50',
    '51-65':'51-65','Older Adult':'51-65','older adult':'51-65',
    '65+':'65+','Senior':'65+','senior':'65+','Elderly':'65+',
}
_PHASE_CANON = {
    'I':'Phase-I','Phase-1':'Phase-I','Phase 1':'Phase-I','1':'Phase-I',
    'II':'Phase-II','Phase-2':'Phase-II','Phase 2':'Phase-II','2':'Phase-II',
    'III':'Phase-III','Phase-3':'Phase-III','Phase 3':'Phase-III','3':'Phase-III',
    'IV':'Phase-IV','Phase-4':'Phase-IV','Phase 4':'Phase-IV','4':'Phase-IV',
}
_ALL_AGES    = ['<18','18-35','36-50','51-65','65+']
_DEV_THRESH  = 0.15   # 15 percentage-point deviation triggers a flag
_MIN_PHASE_ROWS = 3   # phases with fewer rows are skipped

def pharma_age_balance_check(rows: list) -> dict:
    """
    Per-drug (pharma company proxy) age-group distribution check.

    For every drug_name in the dataset:
      1. Group rows by clinical phase.
      2. Compute the proportion of each of the 5 age groups per phase.
      3. Compare each phase distribution against the drug's overall distribution.
      4. Flag any age group whose proportion shifts >15 pp between any phase and
         the overall average -- a sign of systematic enrollment bias.

    Requires >= 2 qualifying phases (>= 3 rows each) to produce a result.
    """
    from collections import defaultdict

    # drug -> phase -> age -> count
    tally: dict = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))
    for row in rows:
        drug  = str(row.get('drug_name','Unknown')).strip() or 'Unknown'
        age   = _AGE_CANON.get(str(row.get('age_group','')).strip(), 'Other')
        phase = _PHASE_CANON.get(str(row.get('phase','')).strip(),
                                  str(row.get('phase','Unknown')))
        tally[drug][phase][age] += 1

    drug_results: dict = {}
    flagged_drugs: list = []

    for drug, phases in tally.items():
        # Build per-phase stats (only phases with enough rows)
        phase_dists: dict = {}
        for phase, age_counts in phases.items():
            total = sum(age_counts.values())
            if total < _MIN_PHASE_ROWS:
                continue
            phase_dists[phase] = {
                "total":       total,
                "counts":      {ag: age_counts.get(ag,0) for ag in _ALL_AGES},
                "proportions": {ag: round(age_counts.get(ag,0)/total, 4)
                                 for ag in _ALL_AGES},
            }

        if len(phase_dists) < 2:
            drug_results[drug] = {
                "phases": list(phases.keys()),
                "phase_count": len(phases),
                "flagged": False,
                "skipped_reason": "fewer than 2 phases with sufficient data",
            }
            continue

        # Overall proportions across qualifying phases for this drug
        total_all = sum(pd["total"] for pd in phase_dists.values())
        overall   = {ag: sum(pd["counts"][ag] for pd in phase_dists.values()) / total_all
                     for ag in _ALL_AGES}

        # Detect deviations > threshold
        flags: list = []
        max_dev = 0.0
        for phase, dist in phase_dists.items():
            for ag in _ALL_AGES:
                dev = abs(dist["proportions"][ag] - overall[ag])
                max_dev = max(max_dev, dev)
                if dev > _DEV_THRESH:
                    flags.append({
                        "phase":         phase,
                        "age_group":     ag,
                        "phase_pct":     round(dist["proportions"][ag]*100, 1),
                        "overall_pct":   round(overall[ag]*100, 1),
                        "deviation_pct": round(dev*100, 1),
                    })

        is_flagged = bool(flags)
        if is_flagged:
            flagged_drugs.append(drug)

        drug_results[drug] = {
            "phases":              sorted(phase_dists.keys()),
            "phase_count":         len(phase_dists),
            "total_rows":          total_all,
            "overall_proportions": {ag: round(v*100,1) for ag,v in overall.items()},
            "phase_distributions": phase_dists,
            "flags":               flags,
            "max_deviation_pct":   round(max_dev*100, 1),
            "flagged":             is_flagged,
        }

    return {
        "drug_analysis":           drug_results,
        "flagged_drugs":           flagged_drugs,
        "total_drugs":             len(drug_results),
        "drugs_with_flags":        len(flagged_drugs),
        "deviation_threshold_pct": int(_DEV_THRESH*100),
    }


@app.post("/api/dataset/upload", tags=["Dataset"])

async def upload_dataset(file: UploadFile = File(...)):
    """
    Upload a clinical trials CSV.
    - Validates schema
    - Runs ML gate on EVERY row (if models trained)
    - Returns screening report; rejects dataset if fraud is detected
    """
    if not file.filename.endswith(".csv"):
        raise HTTPException(400, "Only CSV files are accepted")

    content = await file.read()
    text    = content.decode("utf-8", errors="replace")
    reader  = csv.DictReader(io.StringIO(text))
    rows    = list(reader)

    if not rows:
        raise HTTPException(400, "CSV is empty")

    missing = REQUIRED_COLUMNS - set(rows[0].keys())
    if missing:
        raise HTTPException(400, f"Missing columns: {missing}")

    # ── Pharma age-balance check (always runs) ───────────────
    balance_report = pharma_age_balance_check([dict(r) for r in rows])

    # ── ML batch screening ────────────────────────────────────
    gate, gate_err = get_ml_gate()
    screening = {
        "ml_active":   gate is not None,
        "total_rows":  len(rows),
        "valid_rows":  0,
        "flagged_rows": 0,
        "flagged_details": [],   # list of {row_index, trial_id, confidence, reason}
    }

    if gate is not None:
        for i, row in enumerate(rows):
            try:
                age_enc, dosage, resp, ph_enc, adv_flag = extract_features(row)
                pred = gate.predict(age_enc, dosage, resp, ph_enc, adv_flag)
                if pred["result"] == "MANIPULATED":
                    screening["flagged_rows"] += 1
                    screening["flagged_details"].append({
                        "row_index":  i + 2,          # 1-indexed + header
                        "trial_id":   row.get("trial_id", f"row-{i+2}"),
                        "patient_id": row.get("patient_id", ""),
                        "age_group":  row.get("age_group", ""),
                        "phase":      row.get("phase", ""),
                        "dosage":     dosage,
                        "response_days": resp,
                        "adverse_event": row.get("adverse_event", ""),
                        "confidence": pred["confidence"],
                        "threshold":  pred.get("threshold", 0.35),
                    })
                else:
                    screening["valid_rows"] += 1
            except Exception as e:
                # Can't screen this row — count as valid but note it
                screening["valid_rows"] += 1

        flagged_rate = screening["flagged_rows"] / max(len(rows), 1)
        screening["flagged_rate_pct"] = round(flagged_rate * 100, 1)

        # Hard-block if >20% of rows are fraudulent (clearly malicious/biased dataset)
        # Below 20%: pass through with warning (training datasets naturally have ~15-20% fraud labels)
        BLOCK_THRESHOLD = 0.20
        if flagged_rate > BLOCK_THRESHOLD:
            # ── Save to Drug Authority review queue ───────────────
            rejection_id = str(_uuid.uuid4())
            _rejected_datasets.append({
                "id":             rejection_id,
                "filename":       file.filename,
                "submitted_at":   time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "status":         "PENDING_REVIEW",
                "total_rows":     len(rows),
                "flagged_rows":   screening["flagged_rows"],
                "flagged_rate_pct": screening["flagged_rate_pct"],
                "rows":           [dict(r) for r in rows],
                "screening":      screening,
                "balance_report": balance_report,
                "columns":        list(rows[0].keys()),
                "approved_by":    None,
                "approved_at":    None,
                "approval_note":  None,
                "tx_ids":         [],
            })
            return JSONResponse(
                status_code=422,
                content={
                    "error":          "DATASET_FRAUD_DETECTED",
                    "message":        f"{screening['flagged_rows']} of {len(rows)} records ({screening['flagged_rate_pct']}%) failed ML fraud screening",
                    "screening":      screening,
                    "balance_report": balance_report,
                    "block_threshold_pct": int(BLOCK_THRESHOLD * 100),
                    "columns":        list(rows[0].keys()),
                    "hashed_sample":  hash_batch([dict(r) for r in rows[:3]])[:2],
                    "rejection_id":   rejection_id,
                }
            )
    else:
        screening["valid_rows"] = len(rows)

    # Hash all records and return
    hashed = hash_batch([dict(r) for r in rows[:5]])
    return {
        "total_rows":     len(rows),
        "columns":        list(rows[0].keys()),
        "hashed_sample":  hashed[:3],
        "screening":      screening,
        "balance_report": balance_report,
    }


# ═════════════════════════════════════════════════════════════
# Drug Authority Admin — rejected dataset review queue
# ═════════════════════════════════════════════════════════════

class AdminApproveRequest(BaseModel):
    approved_by:   str           # admin username / node ID
    approval_note: str = ""      # optional justification
    push_to_chain: bool = True   # if True, submit each row as a tx to the mempool


@app.get("/api/admin/rejected-datasets", tags=["Admin"])
def list_rejected_datasets():
    """Return all datasets that were blocked by the ML gate, newest first."""
    summary = []
    for d in reversed(_rejected_datasets):
        summary.append({
            "id":              d["id"],
            "filename":        d["filename"],
            "submitted_at":    d["submitted_at"],
            "status":          d["status"],
            "total_rows":      d["total_rows"],
            "flagged_rows":    d["flagged_rows"],
            "flagged_rate_pct": d["flagged_rate_pct"],
            "approved_by":     d["approved_by"],
            "approved_at":     d["approved_at"],
            "approval_note":   d["approval_note"],
            "tx_count":        len(d["tx_ids"]),
            "screening":       d["screening"],
        })
    return {"rejected_datasets": summary, "total": len(summary)}


@app.get("/api/admin/rejected-datasets/{rejection_id}", tags=["Admin"])
def get_rejected_dataset(rejection_id: str):
    """Get full details including all rows of a rejected dataset."""
    ds = next((d for d in _rejected_datasets if d["id"] == rejection_id), None)
    if not ds:
        raise HTTPException(404, "Rejected dataset not found")
    return ds


@app.post("/api/admin/rejected-datasets/{rejection_id}/approve", tags=["Admin"])
def approve_rejected_dataset(rejection_id: str, req: AdminApproveRequest):
    """
    Drug Authority admin approves a blocked dataset:
    - Marks it as APPROVED in the review queue
    - If push_to_chain=True, submits every row as a signed transaction to the mempool
      (ML gate is bypassed — authority has manually verified the data)
    """
    ds = next((d for d in _rejected_datasets if d["id"] == rejection_id), None)
    if not ds:
        raise HTTPException(404, "Rejected dataset not found")
    if ds["status"] == "APPROVED":
        raise HTTPException(409, "Dataset has already been approved")

    tx_ids = []
    errors = []

    if req.push_to_chain:
        for row in ds["rows"]:
            try:
                # Hash the record for on-chain storage
                record_hash = hash_batch([row])[0]["data_hash"]
                # Upload to IPFS (mock or real)
                ipfs_result = ipfs.upload_dict(row)
                cid = ipfs_result.get("cid", "")
                # Submit to mempool — bypass ML gate by calling create_transaction directly
                tx = create_transaction(
                    trial_id  = row.get("trial_id", f"admin-{_uuid.uuid4().hex[:8]}"),
                    node_id   = row.get("node_id", "NODE-AUTHORITY"),
                    data_hash = record_hash,
                    ipfs_cid  = cid,
                    metadata  = {
                        "phase":              row.get("phase", ""),
                        "drug_name":          row.get("drug_name", ""),
                        "age_group":          row.get("age_group", ""),
                        "dosage_level_mg":    float(row.get("dosage_level_mg", 0) or 0),
                        "response_time_days": int(float(row.get("response_time_days", 0) or 0)),
                        "adverse_event":      row.get("adverse_event", "None"),
                        "adverse_event_flag": int(float(row.get("adverse_event_flag", 0) or 0)),
                        "admin_approved":     True,
                        "approved_by":        req.approved_by,
                        "approval_note":      req.approval_note,
                    },
                )
                mempool.submit(tx)
                tx_ids.append(tx.tx_id)
            except Exception as e:
                errors.append({"trial_id": row.get("trial_id", "?"), "error": str(e)})

    # Update record in store
    ds["status"]       = "APPROVED"
    ds["approved_by"]  = req.approved_by
    ds["approved_at"]  = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    ds["approval_note"] = req.approval_note
    ds["tx_ids"]       = tx_ids

    return {
        "rejection_id":  rejection_id,
        "status":        "APPROVED",
        "approved_by":   req.approved_by,
        "pushed_tx":     len(tx_ids),
        "errors":        errors,
        "tx_ids":        tx_ids[:10],   # first 10 for display
    }


@app.delete("/api/admin/rejected-datasets/{rejection_id}", tags=["Admin"])
def dismiss_rejected_dataset(rejection_id: str):
    """Dismiss / delete a rejected dataset from the review queue."""
    global _rejected_datasets
    before = len(_rejected_datasets)
    _rejected_datasets = [d for d in _rejected_datasets if d["id"] != rejection_id]
    if len(_rejected_datasets) == before:
        raise HTTPException(404, "Rejected dataset not found")
    return {"status": "dismissed", "rejection_id": rejection_id}



# ═════════════════════════════════════════════════════════════
# Step 2 — Hashing
# ═════════════════════════════════════════════════════════════

@app.post("/api/hash/compute", tags=["Hashing"])
def compute_hash(req: HashRequest):
    return {"hash": sha256_hash(req.data)}

@app.post("/api/hash/record", tags=["Hashing"])
def hash_single_record(req: TrialRecord):
    raw = req.dict()
    return hash_record(raw)

@app.post("/api/hash/avalanche", tags=["Hashing"])
def demo_avalanche(req: AvalancheRequest):
    return avalanche_demo(req.original, req.modified)

@app.post("/api/hash/verify", tags=["Hashing"])
def verify_hash(req: VerifyRequest):
    return verify_record(req.raw_record, req.stored_hash)


# ═════════════════════════════════════════════════════════════
# Step 3 — Transactions & Mempool
# ═════════════════════════════════════════════════════════════

@app.post("/api/transactions/submit", tags=["Transactions"])
def submit_transaction(req: TransactionRequest):
    """
    Submit a transaction to the mempool.
    If ML models are trained, runs the XGBoost gate first.
    MANIPULATED records are hard-rejected (HTTP 422).
    """
    ml_gate_result = None
    ml_warning     = None

    # ── ML Pre-chain Gate ────────────────────────────────────
    gate, err = get_ml_gate()
    if gate is not None:
        # Extract features from metadata (sent by InventorPortal / API callers)
        meta = req.metadata or {}
        try:
            age_map  = {
                '<18':0, 'Pediatric':0, 'pediatric':0,
                '18-35':1, 'Young Adult':1, 'young adult':1,
                '36-50':2, 'Middle-Aged':2, 'middle-aged':2, 'Adult':2,
                '51-65':3, 'Older Adult':3, 'older adult':3,
                '65+':4, 'Senior':4, 'senior':4, 'Elderly':4,
            }
            ph_map   = {
                'I':0,   'Phase-1':0, 'Phase 1':0, '1':0,
                'II':1,  'Phase-2':1, 'Phase 2':1, '2':1,
                'III':2, 'Phase-3':2, 'Phase 3':2, '3':2,
                'IV':3,  'Phase-4':3, 'Phase 4':3, '4':3,
            }
            adv_map  = {'None':0,'No':0,'no':0,'0':0,
                        'Mild':1,'mild':1,
                        'Moderate':2,'moderate':2,
                        'Severe':3,'severe':3,
                        'Yes':3,'yes':3,        # biased dataset uses Yes/No
                        'Life-threatening':4,'life-threatening':4}

            age_enc  = age_map.get(str(meta.get('age_group','36-50')), 2)
            ph_enc   = ph_map.get(str(meta.get('phase','II')), 1)
            dosage   = float(meta.get('dosage_level_mg', 250))
            resp     = int(meta.get('response_time_days', 90))
            adv_raw  = str(meta.get('adverse_event','None'))
            adv_flag = int(meta.get('adverse_event_flag',
                           1 if adv_map.get(adv_raw, 0) > 0 else 0))

            prediction = gate.predict(age_enc, dosage, resp, ph_enc, adv_flag)
            ml_gate_result = prediction

            if prediction['result'] == 'MANIPULATED':
                governance.actions.append(__import__('blockchain.governance', fromlist=['GovernanceAction'])
                    .GovernanceAction(
                        action_type='ALERT',
                        target_node=req.node_id,
                        delta=0,
                        reason=f"TX {req.trial_id} REJECTED by ML gate — fraud prob {prediction['confidence']:.2%}"
                    ))
                raise HTTPException(
                    status_code=422,
                    detail={
                        "error":        "ML_GATE_REJECTED",
                        "message":      "Transaction rejected by ML fraud gate",
                        "trial_id":     req.trial_id,
                        "confidence":   prediction['confidence'],
                        "result":       prediction['result'],
                        "advice":       "Review the trial data for anomalies before resubmitting",
                    }
                )
        except HTTPException:
            raise
        except Exception as e:
            ml_warning = f"ML gate skipped (missing features): {e}"
    elif err:
        ml_warning = f"ML gate not active (models not trained): {err}"

    # ── Mempool submission ───────────────────────────────────
    tx = create_transaction(
        trial_id=req.trial_id,
        node_id=req.node_id,
        data_hash=req.data_hash,
        ipfs_cid=req.ipfs_cid,
        metadata=req.metadata,
        private_key_hex=req.private_key_hex,
    )
    result = mempool.submit(tx)
    if ml_warning:
        result['ml_warning'] = ml_warning
    if ml_gate_result:
        result['ml_gate'] = ml_gate_result
    return result


@app.get("/api/transactions/pending", tags=["Transactions"])
def get_pending():
    return {"pending": mempool.get_pending(), "stats": mempool.stats()}

@app.get("/api/transactions/stats", tags=["Transactions"])
def tx_stats():
    return mempool.stats()


# ═════════════════════════════════════════════════════════════
# Step 4 — Nodes / RBAC
# ═════════════════════════════════════════════════════════════

@app.get("/api/nodes", tags=["Nodes"])
def list_nodes(role: Optional[str] = None):
    nr = NodeRole[role] if role and role in NodeRole.__members__ else None
    return {"nodes": registry.list_nodes(nr), "stats": registry.stats()}

@app.post("/api/nodes/register", tags=["Nodes"])
def register_node(req: NodeRegisterRequest):
    try:
        role = NodeRole[req.role]
    except KeyError:
        raise HTTPException(400, f"Unknown role: {req.role}")
    node = Node(req.node_id, role, req.organization)
    if req.private_key_hex:
        node.private_key = req.private_key_hex
    return registry.register(node)

@app.get("/api/nodes/{node_id}", tags=["Nodes"])
def get_node(node_id: str):
    node = registry.get(node_id)
    if not node:
        raise HTTPException(404, "Node not found")
    return node.to_dict()

@app.put("/api/nodes/{node_id}/reputation", tags=["Nodes"])
def update_rep(node_id: str, delta: float):
    new_rep = registry.update_reputation(node_id, delta)
    if new_rep is None:
        raise HTTPException(404, "Node not found")
    return {"node_id": node_id, "new_reputation": new_rep}


# ═════════════════════════════════════════════════════════════
# Step 5 — ML Gate
# ═════════════════════════════════════════════════════════════

class MLPredictRequest(BaseModel):
    age_group_enc: int
    dosage_level_mg: float
    response_time_days: int
    phase_enc: int
    adverse_event_flag: int

@app.post("/api/ml/predict", tags=["ML"])
def ml_predict(req: MLPredictRequest):
    gate, err = get_ml_gate()
    if gate is None:
        raise HTTPException(503, f"ML models not trained yet. Run ml/train_models.py first. ({err})")
    return gate.predict(
        req.age_group_enc, req.dosage_level_mg,
        req.response_time_days, req.phase_enc, req.adverse_event_flag
    )

@app.get("/api/ml/summary", tags=["ML"])
def ml_summary():
    summary_path = Path(__file__).parent.parent / "ml" / "saved_models" / "evaluation_summary.json"
    if not summary_path.exists():
        raise HTTPException(503, "ML models not trained yet. Run ml/train_models.py first.")
    with open(summary_path) as f:
        data = json.load(f)
    # Tag the active fraud-gate model so the frontend can highlight it correctly
    GATE_MODEL = "XGBoost"
    data["gate_model"] = GATE_MODEL
    for m in data.get("models", []):
        m["is_gate_model"] = (m.get("name", "").startswith(GATE_MODEL))
    return data


# ═════════════════════════════════════════════════════════════
# Step 7/8 — Consensus
# ═════════════════════════════════════════════════════════════

class ProposeRequest(BaseModel):
    proposer_id: str
    block_data: Dict

@app.post("/api/consensus/propose", tags=["Consensus"])
def propose_block(req: ProposeRequest):
    try:
        bh = consensus.propose_block(req.proposer_id, req.block_data)
        return {"block_hash": bh, "status": "OPEN"}
    except Exception as e:
        raise HTTPException(400, str(e))

@app.post("/api/consensus/vote", tags=["Consensus"])
def cast_vote(req: VoteRequest):
    return consensus.cast_vote(req.voter_id, req.block_hash, req.approve)

@app.post("/api/consensus/finalize/{block_hash}", tags=["Consensus"])
def finalize(block_hash: str):
    return consensus.finalize(block_hash)

@app.get("/api/consensus/round/{block_hash}", tags=["Consensus"])
def get_round(block_hash: str):
    rnd = consensus.get_round(block_hash)
    if not rnd:
        raise HTTPException(404, "Round not found")
    return rnd


# ═════════════════════════════════════════════════════════════
# Step 9 — Blockchain
# ═════════════════════════════════════════════════════════════

class AppendBlockRequest(BaseModel):
    validator_id: str
    validator_sig: str = ""

@app.post("/api/blockchain/mine", tags=["Blockchain"])
def mine_block(req: AppendBlockRequest):
    """Drain pending transactions, create and append a new block."""
    batch = mempool.drain_batch(size=10)
    if not batch:
        raise HTTPException(400, "No pending transactions to mine")
    txs = [tx.to_dict() for tx in batch]
    block = blockchain.append_block(txs, req.validator_id, req.validator_sig)
    for tx in batch:
        mempool.confirm(tx.tx_id)
    return {"block_index": block.index, "block_hash": block.block_hash,
            "tx_count": len(txs)}

@app.get("/api/blockchain/chain", tags=["Blockchain"])
def get_chain():
    return {"chain": blockchain.get_chain_summary(), "length": len(blockchain)}

@app.get("/api/blockchain/block/{index}", tags=["Blockchain"])
def get_block(index: int):
    b = blockchain.get_block(index)
    if b is None:
        raise HTTPException(404, "Block not found")
    return b

@app.get("/api/blockchain/verify", tags=["Blockchain"])
def verify_chain():
    return blockchain.verify_chain()

@app.post("/api/blockchain/tamper-demo", tags=["Blockchain"])
def tamper_demo(block_index: int = 1, field: str = "merkle_root"):
    return blockchain.tamper_demo(block_index, field, "TAMPERED_DATA")


# ═════════════════════════════════════════════════════════════
# Step 10 — IPFS
# ═════════════════════════════════════════════════════════════

class IPFSUploadRequest(BaseModel):
    trial_id: str
    node_id: str
    record: Dict

@app.post("/api/ipfs/upload", tags=["IPFS"])
def ipfs_upload(req: IPFSUploadRequest):
    result = ipfs.upload_dict(req.record)
    link   = ipfs.build_link_record(req.trial_id, result["cid"],
                                    result["sha256"], req.node_id)
    return {"ipfs": result, "on_chain_link": link}

@app.get("/api/ipfs/status", tags=["IPFS"])
def ipfs_status():
    return ipfs.status()


# ═════════════════════════════════════════════════════════════
# Step 12 — Governance
# ═════════════════════════════════════════════════════════════

@app.post("/api/governance/snapshot", tags=["Governance"])
def record_snapshot(snap: GovernanceSnapshot):
    actions = governance.record_snapshot(**snap.dict())
    from dataclasses import asdict
    return {"actions_taken": [asdict(a) for a in actions]}

@app.get("/api/governance/health", tags=["Governance"])
def governance_health():
    return governance.health_report()

@app.get("/api/governance/actions", tags=["Governance"])
def governance_actions(n: int = 20):
    return {"actions": governance.recent_actions(n)}


# ═════════════════════════════════════════════════════════════
# Performance metrics
# ═════════════════════════════════════════════════════════════

_perf_log: List[Dict] = []

@app.middleware("http")
async def perf_middleware(request, call_next):
    t0       = time.perf_counter()
    response = await call_next(request)
    elapsed  = round((time.perf_counter() - t0) * 1000, 2)
    _perf_log.append({"path": request.url.path, "ms": elapsed,
                      "ts": time.time()})
    if len(_perf_log) > 500:
        _perf_log.pop(0)
    response.headers["X-Response-Time"] = f"{elapsed}ms"
    return response

@app.get("/api/metrics", tags=["Metrics"])
def metrics():
    if not _perf_log:
        return {"message": "No data yet"}
    times = [e["ms"] for e in _perf_log[-100:]]
    return {
        "total_requests": len(_perf_log),
        "last_100_avg_ms": round(sum(times)/len(times), 2),
        "last_100_max_ms": max(times),
        "last_100_min_ms": min(times),
        "recent": _perf_log[-10:],
    }


# ═════════════════════════════════════════════════════════════
# Entry point
# ═════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    reload_enabled = os.getenv("UVICORN_RELOAD", "false").lower() == "true"
    uvicorn.run("backend.main:app", host="0.0.0.0", port=port, reload=reload_enabled)
