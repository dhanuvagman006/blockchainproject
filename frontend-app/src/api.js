import axios from 'axios';

const API_BASE_URL = (
  process.env.REACT_APP_API_URL || 
  (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:8000')
).replace(/\/+$/, '');

const API = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

export const computeHash    = (data)    => API.post('/api/hash/compute',   { data });
export const hashRecord     = (record)  => API.post('/api/hash/record',    record);
export const avalancheDemo  = (o, m)    => API.post('/api/hash/avalanche', { original: o, modified: m });
export const verifyHash     = (r, h)    => API.post('/api/hash/verify',    { raw_record: r, stored_hash: h });

// ── Dataset ──────────────────────────────────────────────────
export const uploadDataset  = (formData) => API.post('/api/dataset/upload', formData,
  { headers: { 'Content-Type': 'multipart/form-data' } });

// ── Transactions ─────────────────────────────────────────────
export const submitTx       = (tx)      => API.post('/api/transactions/submit',  tx);
export const getPending     = ()        => API.get('/api/transactions/pending');
export const getTxStats     = ()        => API.get('/api/transactions/stats');

// ── Nodes ────────────────────────────────────────────────────
export const getNodes       = (role)    => API.get('/api/nodes', { params: { role } });
export const registerNode   = (node)    => API.post('/api/nodes/register', node);
export const getNode        = (id)      => API.get(`/api/nodes/${id}`);
export const updateRep      = (id, d)   => API.put(`/api/nodes/${id}/reputation`, null, { params: { delta: d } });

// ── ML ───────────────────────────────────────────────────────
export const mlPredict      = (feat)    => API.post('/api/ml/predict',  feat);
export const mlSummary      = ()        => API.get('/api/ml/summary');

// ── Consensus ────────────────────────────────────────────────
export const proposeBlock   = (p, d)    => API.post('/api/consensus/propose', { proposer_id: p, block_data: d });
export const castVote       = (v, h, a) => API.post('/api/consensus/vote',    { voter_id: v, block_hash: h, approve: a });
export const finalizeBlock  = (h)       => API.post(`/api/consensus/finalize/${h}`);

// ── Blockchain ───────────────────────────────────────────────
export const mineBlock      = (vid)     => API.post('/api/blockchain/mine', { validator_id: vid, validator_sig: '' });
export const getChain       = ()        => API.get('/api/blockchain/chain');
export const getBlock       = (i)       => API.get(`/api/blockchain/block/${i}`);
export const verifyChain    = ()        => API.get('/api/blockchain/verify');

// ── IPFS ─────────────────────────────────────────────────────
export const ipfsUpload     = (tid, nid, rec) => API.post('/api/ipfs/upload', { trial_id: tid, node_id: nid, record: rec });
export const ipfsStatus     = ()        => API.get('/api/ipfs/status');

// ── Governance ───────────────────────────────────────────────
export const govHealth      = ()        => API.get('/api/governance/health');
export const govActions     = (n)       => API.get('/api/governance/actions', { params: { n } });

// ── Metrics ──────────────────────────────────────────────────
export const getMetrics     = ()        => API.get('/api/metrics');
export const healthCheck    = ()        => API.get('/health');

// ── Drug Authority Admin ──────────────────────────────────────
export const getRejectedDatasets   = ()           => API.get('/api/admin/rejected-datasets');
export const getRejectedDataset    = (id)         => API.get(`/api/admin/rejected-datasets/${id}`);
export const approveRejectedDataset= (id, body)   => API.post(`/api/admin/rejected-datasets/${id}/approve`, body);
export const dismissRejectedDataset= (id)         => API.delete(`/api/admin/rejected-datasets/${id}`);

export default API;
