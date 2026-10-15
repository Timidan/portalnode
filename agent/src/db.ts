import Database from 'better-sqlite3';
import { config } from './config.js';

export const db = new Database(config.db);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS payouts (
 genesis TEXT NOT NULL, validator TEXT NOT NULL, era INTEGER NOT NULL, page INTEGER NOT NULL DEFAULT -1,
 status TEXT NOT NULL, estimate TEXT, paid TEXT, reason TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(genesis,validator,era,page));
CREATE TABLE IF NOT EXISTS tx_attempts (
 id INTEGER PRIMARY KEY, genesis TEXT NOT NULL, validator TEXT NOT NULL, era INTEGER NOT NULL, page INTEGER NOT NULL DEFAULT -1,
 signer TEXT NOT NULL, nonce TEXT NOT NULL, runtime_fingerprint TEXT NOT NULL, call_hex TEXT NOT NULL, tx_hash TEXT,
 birth INTEGER NOT NULL, death INTEGER NOT NULL, fee_reserved TEXT NOT NULL, fee_quoted TEXT, fee_actual TEXT,
 reserved_at TEXT NOT NULL, charged_at TEXT, status TEXT NOT NULL, finalized_block TEXT, extrinsic_index INTEGER,
 events TEXT, error TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS tx_hash_unique ON tx_attempts(tx_hash) WHERE tx_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS one_inflight_attempt ON tx_attempts((1)) WHERE status IN ('unresolved','paused');
CREATE TABLE IF NOT EXISTS alerts (
 id INTEGER PRIMARY KEY, dedupe_key TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, severity TEXT NOT NULL,
 first_seen TEXT NOT NULL, last_seen TEXT NOT NULL, resolved INTEGER NOT NULL DEFAULT 0, evidence TEXT, delivery_state TEXT);
CREATE TABLE IF NOT EXISTS node_samples (
 sampled_at TEXT PRIMARY KEY, reachable INTEGER NOT NULL, syncing INTEGER, peers INTEGER,
 best_height INTEGER, finalized_height INTEGER, finality_age INTEGER, heartbeat_seen INTEGER, authored_count INTEGER, error TEXT);
CREATE TABLE IF NOT EXISTS network_snapshots (
 finalized_hash TEXT PRIMARY KEY, era INTEGER, validator_count INTEGER, target_count INTEGER,
 stake_concentration TEXT, authority_weights TEXT, identity_count INTEGER, offence_count INTEGER, capability_gaps TEXT,
 computed_at TEXT NOT NULL);
`);
export function alert(key: string, kind: string, severity: string, evidence: string) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO alerts(dedupe_key,kind,severity,first_seen,last_seen,evidence) VALUES(?,?,?,?,?,?)
    ON CONFLICT(dedupe_key) DO UPDATE SET last_seen=excluded.last_seen,evidence=excluded.evidence,resolved=0`,
  ).run(key, kind, severity, now, now, evidence.slice(0, 500));
}
