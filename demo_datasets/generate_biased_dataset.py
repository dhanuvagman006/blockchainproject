"""
Generate a clinically realistic biased dataset where:
- Biased/manipulated records are senior patients (65+) getting pediatric dosages,
  or records with adverse events flagged but implausibly short response times,
  or dropout-like patterns (unrealistic dosage+phase combos).
- ~25% of records are manipulated.
"""
import csv, random, hashlib
from datetime import datetime, timedelta
from pathlib import Path

random.seed(2024)

DRUGS     = ['Drug-A','Drug-B','Drug-C','Drug-D','Drug-E']
ORGS      = ['NODE-001','NODE-002','NODE-003','NODE-004','NODE-005']
AGE_GROUPS = ['<18','18-35','36-50','51-65','65+']
PHASES    = ['I','II','III','IV']
ADVERSE   = ['None','Mild','Moderate','Severe','Life-threatening']

VALID_DOSAGE = {
    '<18':  (5,  50),
    '18-35':(50, 400),
    '36-50':(50, 400),
    '51-65':(25, 300),
    '65+':  (10, 150),
}
VALID_RESP = {'I':(30,90),'II':(60,180),'III':(90,365),'IV':(180,730)}

def sha256(s): return hashlib.sha256(s.encode()).hexdigest()

def gen_valid_record(trial_n):
    ag    = random.choice(AGE_GROUPS)
    ph    = random.choice(PHASES)
    drug  = random.choice(DRUGS)
    dlo,dhi = VALID_DOSAGE[ag]
    rlo,rhi = VALID_RESP[ph]
    dosage  = round(random.uniform(dlo,dhi),1)
    resp    = random.randint(rlo,rhi)
    adv     = random.choices(ADVERSE, weights=[60,20,10,7,3])[0]
    adv_f   = 0 if adv=='None' else 1
    ts      = (datetime(2024,1,1) + timedelta(days=random.randint(0,364))).strftime('%Y-%m-%dT%H:%M:%SZ')
    pid     = f'P{trial_n:04d}'
    tid     = f'NCT-B{trial_n:04d}'
    node    = random.choice(ORGS)
    consent = sha256(f'{pid}:{drug}:{ts}')
    return {
        'trial_id':tid,'patient_id':pid,'age_group':ag,'drug_name':drug,
        'dosage_level_mg':dosage,'phase':ph,'response_time_days':resp,
        'adverse_event':adv,'adverse_event_flag':adv_f,'consent_hash':consent,
        'timestamp':ts,'node_id':node,'manipulated':0
    }

def gen_manipulated_record(trial_n):
    """Create a record that is implausibly biased / manipulated."""
    fraud_type = random.choice([
        'age_dosage_mismatch',   # senior gets pediatric-level dosage
        'impossible_response',   # Phase-III trial done in 5 days
        'suppressed_adverse',    # severe adverse but flagged as None
        'phase_skip',            # junior phase with IV-level response
    ])
    ag,ph,drug = random.choice(['65+','51-65']), random.choice(['II','III','IV']), random.choice(DRUGS)
    ts   = (datetime(2024,1,1) + timedelta(days=random.randint(0,364))).strftime('%Y-%m-%dT%H:%M:%SZ')
    pid  = f'P{trial_n:04d}'
    tid  = f'NCT-B{trial_n:04d}'
    node = random.choice(ORGS)
    consent = sha256(f'{pid}:{drug}:{ts}')

    if fraud_type == 'age_dosage_mismatch':
        dosage = round(random.uniform(1, 10), 1)   # way too low for senior
        resp   = random.randint(60,180)
        adv    = random.choice(['Severe','Life-threatening'])
        adv_f  = 1
    elif fraud_type == 'impossible_response':
        dosage = round(random.uniform(50,200),1)
        resp   = random.randint(1,5)               # impossibly short
        adv    = random.choice(['None','Mild'])
        adv_f  = 0
    elif fraud_type == 'suppressed_adverse':
        dosage = round(random.uniform(200,500),1)  # dangerously high dosage
        resp   = random.randint(30,90)
        adv    = 'None'                            # adverse suppressed
        adv_f  = 0
    else:  # phase_skip
        ph     = 'IV'
        dosage = round(random.uniform(5,20),1)     # pediatric dose in Phase-IV
        resp   = random.randint(5,15)
        adv    = 'Severe'
        adv_f  = 1

    return {
        'trial_id':tid,'patient_id':pid,'age_group':ag,'drug_name':drug,
        'dosage_level_mg':dosage,'phase':ph,'response_time_days':resp,
        'adverse_event':adv,'adverse_event_flag':adv_f,'consent_hash':consent,
        'timestamp':ts,'node_id':node,'manipulated':1
    }

def generate(n=500, fraud_rate=0.25):
    records = []
    n_fraud = int(n * fraud_rate)
    n_valid = n - n_fraud
    for i in range(1, n_valid+1):
        records.append(gen_valid_record(i))
    for i in range(n_valid+1, n+1):
        records.append(gen_manipulated_record(i))
    random.shuffle(records)
    return records

if __name__ == '__main__':
    out = Path(__file__).parent
    rows = generate(500, fraud_rate=0.25)
    fields = ['trial_id','patient_id','age_group','drug_name','dosage_level_mg',
              'phase','response_time_days','adverse_event','adverse_event_flag',
              'consent_hash','timestamp','node_id','manipulated']
    out_path = out / 'biased_clinical_dataset.csv'
    with open(out_path,'w',newline='') as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader(); w.writerows(rows)

    n_manip = sum(1 for r in rows if r['manipulated']==1)
    print(f"✅ Biased dataset generated: {out_path.name}")
    print(f"   Total    : {len(rows)}")
    print(f"   Valid    : {len(rows)-n_manip} ({(len(rows)-n_manip)/len(rows)*100:.1f}%)")
    print(f"   Manipulated: {n_manip} ({n_manip/len(rows)*100:.1f}%)")
