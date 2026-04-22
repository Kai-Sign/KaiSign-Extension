/**
 * Sourcify client - tiny fetch wrapper with disk cache.
 *
 * Used by the verified-abi-coverage test suite to pull verified contract
 * ABIs from Sourcify's public repo. NOT shipped into the extension runtime.
 *
 * Endpoints:
 *   https://repo.sourcify.dev/contracts/full_match/<chainId>/<address>/metadata.json
 *   https://repo.sourcify.dev/contracts/partial_match/<chainId>/<address>/metadata.json
 *
 * Sourcify rejects mixed-case addresses with {"error":"Invalid address"} —
 * always lowercase before constructing the URL.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CACHE_DIR = path.resolve(__dirname, '..', '.cache', 'sourcify');
const SOURCIFY_BASE = 'https://repo.sourcify.dev/contracts';

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function cachePath(chainId, address) {
  return path.join(CACHE_DIR, `${chainId}-${address.toLowerCase()}.json`);
}

function readCache(chainId, address) {
  const p = cachePath(chainId, address);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeCache(chainId, address, payload) {
  ensureCacheDir();
  fs.writeFileSync(cachePath(chainId, address), JSON.stringify(payload, null, 2));
}

async function fetchMetadata(chainId, address, matchType) {
  const url = `${SOURCIFY_BASE}/${matchType}/${chainId}/${address.toLowerCase()}/metadata.json`;
  const res = await fetch(url, { redirect: 'follow' });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Sourcify ${matchType} ${chainId}/${address}: HTTP ${res.status}`);
  }
  const json = await res.json();
  const abi = json?.output?.abi;
  if (!Array.isArray(abi)) return null;
  return { abi, matchType, name: json?.settings?.compilationTarget ? Object.values(json.settings.compilationTarget)[0] : null };
}

/**
 * Fetch the verified ABI for a (chainId, address) pair.
 *
 * Returns { abi, matchType, name } on success, or null when Sourcify has
 * no record of this contract. Cached on disk so reruns are offline.
 */
export async function fetchSourcifyAbi(chainId, address) {
  const cached = readCache(chainId, address);
  if (cached) return cached.notFound ? null : cached;

  let result = await fetchMetadata(chainId, address, 'full_match');
  if (!result) {
    result = await fetchMetadata(chainId, address, 'partial_match');
  }

  if (!result) {
    writeCache(chainId, address, { notFound: true });
    return null;
  }

  writeCache(chainId, address, result);
  return result;
}
