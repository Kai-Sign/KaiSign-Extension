/**
 * KaiSign Local Metadata Server
 *
 * Serves fixture metadata for local testing before production submission.
 *
 * Usage:
 *   npm run local-server
 *
 * Then set Backend API URL to http://localhost:3000 in extension options.
 */

import express from 'express';
import { LocalMetadataService } from './lib/local-metadata-service.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Production API URL for fallback
const PRODUCTION_API_URL = 'https://kai-sign-production.up.railway.app';

// Initialize metadata service
const metadataService = new LocalMetadataService(path.resolve(__dirname, 'fixtures'));

// CORS middleware for browser extension
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

/**
 * Contract metadata endpoint (matches production API)
 * GET /api/py/contract/:address?chain_id=:chainId&selector=:selector
 */
app.get('/api/py/contract/:address', async (req, res) => {
  const { address } = req.params;
  const chainId = parseInt(req.query.chain_id) || 1;
  const selector = req.query.selector || null;

  try {
    const metadata = await metadataService.getContractMetadata(address, chainId, selector);

    if (metadata) {
      console.log(`  -> Found local metadata for ${address.slice(0, 10)}... (chainId: ${chainId})`);
      return res.json({ success: true, metadata });
    }

    // Fallback to production API
    console.log(`  -> Not found locally, proxying to production...`);
    const fallbackUrl = `${PRODUCTION_API_URL}/api/py/contract/${address}?chain_id=${chainId}${selector ? `&selector=${selector}` : ''}`;

    try {
      const fallbackRes = await fetch(fallbackUrl);
      const fallbackData = await fallbackRes.json();
      return res.json(fallbackData);
    } catch (fallbackErr) {
      console.log(`  -> Production fallback failed: ${fallbackErr.message}`);
      return res.json({ success: false, error: 'Metadata not found' });
    }
  } catch (err) {
    console.log(`  -> Error: ${err.message}`);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * EIP-712 metadata endpoint
 * GET /api/py/eip712/:contract/:primaryType
 */
app.get('/api/py/eip712/:contract/:primaryType', async (req, res) => {
  const { contract, primaryType } = req.params;

  try {
    const metadata = await metadataService.getEIP712Metadata(contract, primaryType);

    if (metadata) {
      console.log(`  -> Found EIP-712 metadata for ${contract.slice(0, 10)}... (${primaryType})`);
      return res.json({ success: true, metadata });
    }

    // Fallback to production API
    console.log(`  -> EIP-712 not found locally, proxying to production...`);
    const fallbackUrl = `${PRODUCTION_API_URL}/api/py/eip712/${contract}/${primaryType}`;

    try {
      const fallbackRes = await fetch(fallbackUrl);
      const fallbackData = await fallbackRes.json();
      return res.json(fallbackData);
    } catch (fallbackErr) {
      console.log(`  -> Production fallback failed: ${fallbackErr.message}`);
      return res.json({ success: false, error: 'EIP-712 metadata not found' });
    }
  } catch (err) {
    console.log(`  -> Error: ${err.message}`);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  const stats = metadataService.getCacheStats();
  res.json({
    status: 'ok',
    version: '1.0.0',
    stats
  });
});

/**
 * List all indexed contracts
 * GET /api/contracts
 */
app.get('/api/contracts', (req, res) => {
  const addresses = metadataService.getIndexedAddresses();
  res.json({
    success: true,
    count: addresses.length,
    contracts: addresses.map(addr => ({
      address: addr,
      url: `http://localhost:${PORT}/api/py/contract/${addr}?chain_id=1`
    }))
  });
});

/**
 * Start server
 */
async function start() {
  // Initialize metadata service
  await metadataService.initialize();
  const stats = metadataService.getCacheStats();

  app.listen(PORT, () => {
    console.log('');
    console.log('='.repeat(55));
    console.log('  KaiSign Local Metadata Server');
    console.log('='.repeat(55));
    console.log('');
    console.log(`  Port:              ${PORT}`);
    console.log(`  Indexed contracts: ${stats.indexedContracts}`);
    console.log(`  Diamond proxies:   ${stats.diamondProxies} (${stats.diamondSelectors} selectors)`);
    console.log('');
    console.log('  Endpoints:');
    console.log(`    GET /api/py/contract/:address?chain_id=N`);
    console.log(`    GET /api/py/eip712/:contract/:primaryType`);
    console.log(`    GET /api/contracts`);
    console.log(`    GET /health`);
    console.log('');
    console.log('  To use in extension:');
    console.log('    1. Open extension options (right-click icon > Options)');
    console.log(`    2. Set Backend API URL to: http://localhost:${PORT}`);
    console.log('    3. Save settings');
    console.log('');
    console.log('  Test a contract:');
    console.log(`    curl http://localhost:${PORT}/api/py/contract/0x6A000F20005980200259B80c5102003040001068?chain_id=1`);
    console.log('');
    console.log('='.repeat(55));
    console.log('');
  });
}

start().catch(err => {
  console.log('Failed to start server:', err);
  process.exit(1);
});
