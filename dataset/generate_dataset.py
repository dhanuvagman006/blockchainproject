"""
Dataset Generator for Clinical Trials Data
Mimics ClinicalTrials.gov structure with fields required for ML training.
"""
import csv
import hashlib
import random
import time
from datetime import datetime, timedelta

random.seed(42)

DRUGS = [
    "Metformin", "Atorvastatin", "Lisinopril", "Amlodipine", "Omeprazole",
    "Losartan", "Gabapentin", "Hydrochlorothiazide", "Furosemide", "Simvastatin",
    "Dapagliflozin", "Empagliflozin", "Sacubitril/Valsartan", "Tofacitinib", "Baricitinib"
]

AGE_GROUPS = ["<18", "18-35", "36-50", "51-65", "65+"]
PHASES = ["I", "II", "III", "IV"]
ADVERSE_EVENTS = ["None", "Mild", "Moderate", "Severe", "Life-threatening"]

def generate_consent_hash(patient_id: str, timestamp: str) -> str:
    data = f"{patient_id}:{timestamp}:INFORMED_CONSENT"
    return hashlib.sha256(data.encode()).hexdigest()

def generate_trial_id(idx: int) -> str:
    return f"NCT{str(idx).zfill(8)}"

def generate_patient_id(idx: int) -> str:
    return f"PAT-{str(idx + 10000).zfill(6)}"

def is_manipulated(row: dict) -> int:
    """
    Heuristic rules that simulate data manipulation / fraud patterns:
    - Impossible dosage for age group
    - Phase skipping (Phase III directly after Phase I)
    - Adverse event severity inconsistency
    - Suspiciously short or negative response times
    """
    if row["age_group"] == "<18" and row["dosage_level_mg"] > 200:
        return 1
    if row["phase"] == "IV" and row["response_time_days"] < 10:
        return 1
    if row["adverse_event"] == "Life-threatening" and row["dosage_level_mg"] < 50:
        return 1
    if row["response_time_days"] < 0:
        return 1
    # ~15% random manipulation to add noise
    if random.random() < 0.15:
        return 1
    return 0

def generate_dataset(n: int = 10000, output_path: str = "clinical_trials.csv"):
    rows = []
    base_date = datetime(2020, 1, 1)

    for i in range(n):
        age_group = random.choice(AGE_GROUPS)
        phase = random.choice(PHASES)
        drug = random.choice(DRUGS)

        # Age-appropriate dosage ranges
        if age_group == "<18":
            dosage = round(random.uniform(10, 150), 1)
        elif age_group in ["18-35", "36-50"]:
            dosage = round(random.uniform(50, 500), 1)
        else:
            dosage = round(random.uniform(25, 300), 1)

        # Phase-appropriate response times
        phase_days = {"I": (30, 90), "II": (60, 180), "III": (90, 365), "IV": (180, 730)}
        response_time = random.randint(*phase_days[phase])

        # Occasionally inject anomalies (for manipulated label)
        if random.random() < 0.1:
            response_time = random.randint(-10, 5)   # invalid negative time

        adverse_event = random.choice(ADVERSE_EVENTS)
        adverse_flag = 0 if adverse_event == "None" else 1

        timestamp = (base_date + timedelta(days=random.randint(0, 1825))).strftime("%Y-%m-%dT%H:%M:%SZ")
        patient_id = generate_patient_id(i)
        trial_id = generate_trial_id(i + 3000000)
        consent_hash = generate_consent_hash(patient_id, timestamp)
        node_id = f"NODE-{random.randint(1, 5):02d}"

        row = {
            "trial_id": trial_id,
            "patient_id": patient_id,
            "age_group": age_group,
            "drug_name": drug,
            "dosage_level_mg": dosage,
            "phase": phase,
            "response_time_days": response_time,
            "adverse_event": adverse_event,
            "adverse_event_flag": adverse_flag,
            "consent_hash": consent_hash,
            "timestamp": timestamp,
            "node_id": node_id,
        }
        row["manipulated"] = is_manipulated(row)
        rows.append(row)

    fieldnames = [
        "trial_id", "patient_id", "age_group", "drug_name",
        "dosage_level_mg", "phase", "response_time_days",
        "adverse_event", "adverse_event_flag", "consent_hash",
        "timestamp", "node_id", "manipulated"
    ]

    with open(output_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    valid = sum(1 for r in rows if r["manipulated"] == 0)
    manip = sum(1 for r in rows if r["manipulated"] == 1)
    print(f"✅ Dataset generated: {output_path}")
    print(f"   Total records : {n}")
    print(f"   Valid         : {valid} ({valid/n*100:.1f}%)")
    print(f"   Manipulated   : {manip} ({manip/n*100:.1f}%)")

if __name__ == "__main__":
    generate_dataset(n=10000, output_path="clinical_trials.csv")
