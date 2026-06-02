"""
============================================================
  preprocess_pipeline.py
  ML-Integrated Blockchain — Clinical Trial Fraud Detection
  Preprocessing Pipeline Demonstration
============================================================
  Purpose : Show the guide/professor every preprocessing
            step before model training begins.
  Run     : python3 ml/preprocess_pipeline.py
============================================================
"""

import time
import warnings
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

warnings.filterwarnings("ignore")

# ── Paths ──────────────────────────────────────────────────────────────────
BASE_DIR    = Path(__file__).parent
ROOT_DIR    = BASE_DIR.parent
DATASET_CSV = ROOT_DIR / "dataset"    / "clinical_trials.csv"
DEMO_CSV    = ROOT_DIR / "demo_datasets" / "biased_clinical_dataset.csv"

# ── Ordinal mappings ───────────────────────────────────────────────────────
AGE_MAP = {
    '<18': 0, 'Pediatric': 0, 'pediatric': 0,
    '18-35': 1, 'Young Adult': 1, 'young adult': 1,
    '36-50': 2, 'Middle-Aged': 2, 'middle-aged': 2, 'Adult': 2,
    '51-65': 3, 'Older Adult': 3, 'older adult': 3,
    '65+': 4,  'Senior': 4,  'senior': 4, 'Elderly': 4,
}
PHASE_MAP = {
    'I': 0,   'Phase-1': 0, 'Phase 1': 0, '1': 0,
    'II': 1,  'Phase-2': 1, 'Phase 2': 1, '2': 1,
    'III': 2, 'Phase-3': 2, 'Phase 3': 2, '3': 2,
    'IV': 3,  'Phase-4': 3, 'Phase 4': 3, '4': 3,
}

# Age-appropriate dosage ranges
_AGE_DOSAGE_RANGE = {
    0: (5,   50,  27.5),   # <18  Pediatric
    1: (50,  400, 225.0),  # 18-35 Young Adult
    2: (50,  400, 225.0),  # 36-50 Middle-Aged
    3: (25,  300, 162.5),  # 51-65 Older Adult
    4: (10,  150,  80.0),  # 65+   Senior
}

# Manipulation prior per age group
_AGE_BIAS = {0: 0.18, 1: 0.20, 2: 0.15, 3: 0.30, 4: 0.29}

FEATURE_NAMES = [
    "age_group_enc",
    "dosage_level_mg",
    "response_time_days",
    "phase_enc",
    "adverse_event_flag",
    "neg_resp_flag",
    "age_bias_score",
    "dosage_extremity",
    "short_resp_flag",
    "high_adv_old",
]

FEATURE_DESCRIPTIONS = {
    "age_group_enc":      "Ordinal encoding of patient age group  (0=<18 … 4=65+)",
    "dosage_level_mg":    "Raw dosage in milligrams (numeric)",
    "response_time_days": "Trial response duration in days (numeric)",
    "phase_enc":          "Ordinal encoding of trial phase        (0=Phase-I … 3=Phase-IV)",
    "adverse_event_flag": "Encoded adverse event severity         (0=None … 4=Life-threatening)",
    "neg_resp_flag":      "🚩 Engineered: 1 if response_time_days < 0  (impossible → fraud signal)",
    "age_bias_score":     "🚩 Engineered: Manipulation prior per age group from training distribution",
    "dosage_extremity":   "🚩 Engineered: Deviation of dosage from age-appropriate normal range",
    "short_resp_flag":    "🚩 Engineered: 1 if response_time_days ≤ 15 (phase-skip / impossible response)",
    "high_adv_old":       "🚩 Engineered: 1 if severe adverse event AND patient is senior (51+)",
}

# ── Helpers ────────────────────────────────────────────────────────────────

def banner(title: str, char: str = "=", width: int = 62):
    print(f"\n{char * width}")
    print(f"  {title}")
    print(f"{char * width}")

def step(number: int, total: int, label: str):
    print(f"\n  ┌─ STEP {number}/{total} {'─'*40}")
    print(f"  │  {label}")
    print(f"  └{'─'*47}")

def tick(msg: str):
    print(f"  ✅  {msg}")

def info(msg: str):
    print(f"  ℹ️   {msg}")

def pause(seconds: float = 0.3):
    time.sleep(seconds)

# ── STEP 1: Load raw datasets ──────────────────────────────────────────────

def step1_load_data():
    step(1, 6, "Loading raw CSV datasets")
    pause()

    frames = []
    for path in [DATASET_CSV, DEMO_CSV]:
        if path.exists():
            df = pd.read_csv(path)
            frames.append(df)
            tick(f"Loaded  {path.name:<40} → {len(df):,} rows")
        else:
            print(f"  ⚠️   Skipped (not found): {path.name}")

    if not frames:
        raise FileNotFoundError(
            "No training CSV found. Run  dataset/generate_dataset.py  first."
        )

    df = pd.concat(frames, ignore_index=True)
    info(f"Combined dataset  : {len(df):,} rows")
    info(f"Valid records     : {(df['manipulated'] == 0).sum():,}  ({(df['manipulated']==0).mean()*100:.1f}%)")
    info(f"Manipulated       : {df['manipulated'].sum():,}  ({df['manipulated'].mean()*100:.1f}%)")
    info(f"Columns available : {list(df.columns)}")
    pause()
    return df

# ── STEP 2: Handle missing values ─────────────────────────────────────────

def step2_missing_values(df: pd.DataFrame):
    step(2, 6, "Checking & handling missing values")
    pause()

    missing = df.isnull().sum()
    if missing.sum() == 0:
        tick("No missing values found in any column")
    else:
        print("  ⚠️   Missing values detected:")
        for col, cnt in missing[missing > 0].items():
            print(f"        {col}: {cnt}")
        df = df.dropna()
        tick(f"Dropped rows with NaN → {len(df):,} rows remaining")

    info(f"Dataset shape after null check: {df.shape}")
    pause()
    return df

# ── STEP 3: Ordinal encoding ───────────────────────────────────────────────

def step3_encode_categoricals(df: pd.DataFrame):
    step(3, 6, "Encoding categorical columns → ordinal integers")
    pause()

    df = df.copy()

    print("  📋 age_group  mapping:")
    groups_seen = df["age_group"].unique()
    for g in sorted(groups_seen, key=lambda x: AGE_MAP.get(str(x), -1)):
        enc = AGE_MAP.get(str(g), 2)
        print(f"       '{g}'  →  {enc}")
    df["age_group_enc"] = df["age_group"].map(lambda x: AGE_MAP.get(str(x), 2))
    tick("age_group encoded → age_group_enc")
    pause(0.2)

    print("\n  📋 phase  mapping:")
    phases_seen = df["phase"].unique()
    for p in sorted(phases_seen, key=lambda x: PHASE_MAP.get(str(x), -1)):
        enc = PHASE_MAP.get(str(p), 1)
        print(f"       '{p}'  →  {enc}")
    df["phase_enc"] = df["phase"].map(lambda x: PHASE_MAP.get(str(x), 1))
    tick("phase encoded → phase_enc")
    pause()
    return df

# ── STEP 4: Feature engineering ───────────────────────────────────────────

def _engineer_row(age_enc, dosage, resp_days, phase_enc, adv_flag):
    neg_resp_flag  = 1 if resp_days < 0 else 0
    age_bias_score = _AGE_BIAS.get(int(age_enc), 0.2)
    lo, hi, _      = _AGE_DOSAGE_RANGE.get(int(age_enc), (50, 400, 225.0))
    span           = max(hi - lo, 1)
    dosage_ext     = (max(0.0, (float(dosage) - hi) / span)
                    + max(0.0, (lo - float(dosage)) / span))
    short_resp     = 1 if int(resp_days) <= 15 else 0
    high_adv_old   = 1 if (int(adv_flag) >= 1 and int(age_enc) >= 3) else 0
    return [neg_resp_flag, age_bias_score, dosage_ext, short_resp, high_adv_old]


def step4_feature_engineering(df: pd.DataFrame):
    step(4, 6, "Engineering fraud-detection features")
    pause()

    print("  📐 Base features (directly from CSV columns):")
    base_feats = ["age_group_enc", "dosage_level_mg", "response_time_days",
                  "phase_enc", "adverse_event_flag"]
    for f in base_feats:
        print(f"       ✔  {f:<28} — {FEATURE_DESCRIPTIONS[f]}")
    pause(0.3)

    print("\n  🔧 Engineered features (derived signals):")
    eng_feats = ["neg_resp_flag", "age_bias_score", "dosage_extremity",
                 "short_resp_flag", "high_adv_old"]
    for f in eng_feats:
        print(f"       ✔  {f:<28} — {FEATURE_DESCRIPTIONS[f]}")
    pause(0.3)

    print("\n  ⏳ Computing engineered features for all rows ...")
    t0  = time.perf_counter()
    eng = df.apply(lambda r: _engineer_row(
        r["age_group_enc"], r["dosage_level_mg"], r["response_time_days"],
        r["phase_enc"],     r["adverse_event_flag"]
    ), axis=1, result_type="expand")
    eng.columns = ["neg_resp_flag", "age_bias_score", "dosage_extremity",
                   "short_resp_flag", "high_adv_old"]
    elapsed = time.perf_counter() - t0

    base_df = df[base_feats].reset_index(drop=True)
    X_df    = pd.concat([base_df, eng.reset_index(drop=True)], axis=1)[FEATURE_NAMES]
    tick(f"Feature engineering done in {elapsed:.3f}s")
    info(f"Feature matrix shape: {X_df.shape}  ({len(FEATURE_NAMES)} features × {len(X_df):,} samples)")

    print("\n  📊 Feature statistics (first look):")
    print(X_df.describe().to_string())
    pause()
    return X_df.values, df["manipulated"].values

# ── STEP 5: Scaling ────────────────────────────────────────────────────────

def step5_scale_features(X: np.ndarray):
    step(5, 6, "Normalising features with StandardScaler  (zero mean, unit variance)")
    pause()

    info(f"Input  — mean of first feature (age_group_enc) BEFORE scaling : {X[:, 0].mean():.4f}")
    info(f"Input  — std  of first feature (age_group_enc) BEFORE scaling : {X[:, 0].std():.4f}")

    scaler = StandardScaler()
    Xs     = scaler.fit_transform(X)

    info(f"Output — mean of first feature AFTER  scaling : {Xs[:, 0].mean():.6f}  (≈ 0)")
    info(f"Output — std  of first feature AFTER  scaling : {Xs[:, 0].std():.6f}   (≈ 1)")
    tick("StandardScaler fitted and applied to all features")
    pause()
    return Xs, scaler

# ── STEP 6: Train / Test split ─────────────────────────────────────────────

def step6_train_test_split(Xs: np.ndarray, y: np.ndarray):
    step(6, 6, "Splitting into Train (80%) and Test (20%) sets  [stratified]")
    pause()

    Xtr, Xte, ytr, yte = train_test_split(
        Xs, y, test_size=0.2, random_state=42, stratify=y
    )

    tick(f"Train set : {len(Xtr):,} samples  |  Manipulated: {ytr.sum():,}  ({ytr.mean()*100:.1f}%)")
    tick(f"Test  set : {len(Xte):,} samples  |  Manipulated: {yte.sum():,}  ({yte.mean()*100:.1f}%)")
    info("Stratification ensures class ratios are preserved in both splits")
    info("random_state=42 guarantees reproducibility across runs")
    pause()
    return Xtr, Xte, ytr, yte

# ── Models summary ─────────────────────────────────────────────────────────

def show_models_ready(Xtr: np.ndarray):
    banner("PREPROCESSING COMPLETE — Models ready to train", char="═")
    models = [
        ("Logistic Regression",  "Baseline linear classifier"),
        ("SVM (RBF kernel)",     "Non-linear support vector machine"),
        ("Decision Tree",        "Rule-based depth-4 tree"),
        ("Random Forest",        "60-tree ensemble, max_depth=5"),
        ("KNN (K=13)",           "Distance-based lazy learner"),
        ("Naive Bayes",          "Probabilistic Gaussian classifier"),
        ("XGBoost ⚡ (GATE)",    "Gradient-boosted trees — live fraud gate"),
        ("ANN (MLP)",            "3-layer neural network with dropout"),
    ]
    print(f"\n  {'#':<4} {'Model':<30} {'Role / Notes'}")
    print(f"  {'─'*4} {'─'*30} {'─'*28}")
    for i, (name, note) in enumerate(models, 1):
        print(f"  {i:<4} {name:<30} {note}")
    print(f"\n  📥 Each model will receive : {Xtr.shape[1]} scaled features")
    print(f"  📦 Training samples        : {len(Xtr):,}")
    print(f"\n  ➡️  Run  python ml/train_models.py  to start training all 8 models.\n")

# ── Main ───────────────────────────────────────────────────────────────────

def main():
    banner(
        "ML Verification Layer — Preprocessing Pipeline Demo\n"
        "  Project : Clinical Trial Fraud Detection on Blockchain",
        char="="
    )
    print("  This script walks through every preprocessing step")
    print("  performed before training the 8 ML fraud-detection models.")
    pause(0.5)

    df           = step1_load_data()
    df           = step2_missing_values(df)
    df           = step3_encode_categoricals(df)
    X, y         = step4_feature_engineering(df)
    Xs, scaler   = step5_scale_features(X)
    Xtr, Xte, ytr, yte = step6_train_test_split(Xs, y)

    show_models_ready(Xtr)


if __name__ == "__main__":
    main()
