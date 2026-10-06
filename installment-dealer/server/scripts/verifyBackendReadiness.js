import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverDir = path.resolve(__dirname, '..');

const TEST_PORT = 5055;

console.log('--- Starting Backend Server for Health & Production Verification ---');

const serverProcess = spawn('node', ['server.js'], {
  cwd: serverDir,
  env: {
    ...process.env,
    PORT: String(TEST_PORT),
    NODE_ENV: 'production',
    CLIENT_ORIGIN: 'https://project-karthi-b0f29.web.app',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let serverOutput = '';
let serverStarted = false;

serverProcess.stdout.on('data', (data) => {
  const str = data.toString();
  serverOutput += str;
  process.stdout.write(str);
  if (str.includes(`Server is running on port ${TEST_PORT}`)) {
    serverStarted = true;
  }
});

serverProcess.stderr.on('data', (data) => {
  const str = data.toString();
  serverOutput += str;
  process.stderr.write(str);
});

const cleanup = () => {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill('SIGTERM');
  }
};

process.on('exit', cleanup);
process.on('SIGINT', cleanup);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runVerification() {
  try {
    // Wait up to 10 seconds for server to boot and connect to Firestore
    for (let i = 0; i < 20; i++) {
      if (serverStarted) break;
      await wait(500);
    }

    if (!serverStarted) {
      throw new Error(`Server failed to start within timeout. Output:\n${serverOutput}`);
    }

    console.log('\n--- 1. Testing GET /api/health ---');
    const healthRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/health`);
    const healthData = await healthRes.json();
    console.log('Status:', healthRes.status);
    console.log('Body:', JSON.stringify(healthData));

    if (healthRes.status !== 200 || !healthData.success) {
      throw new Error(`Unexpected /api/health response: status ${healthRes.status}`);
    }
    console.log('✅ /api/health endpoint returned HTTP 200 with success: true');

    console.log('\n--- 2. Testing GET /health ---');
    const rootHealthRes = await fetch(`http://127.0.0.1:${TEST_PORT}/health`);
    const rootHealthData = await rootHealthRes.json();
    console.log('Status:', rootHealthRes.status);
    console.log('Body:', JSON.stringify(rootHealthData));

    if (rootHealthRes.status !== 200 || !rootHealthData.success) {
      throw new Error(`Unexpected /health response: status ${rootHealthRes.status}`);
    }
    console.log('✅ /health endpoint returned HTTP 200 with success: true');

    console.log('\n--- 3. Testing CORS for Production Frontend Domain ---');
    const corsProdRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/health`, {
      headers: {
        Origin: 'https://project-karthi-b0f29.web.app',
      },
    });
    const allowOrigin = corsProdRes.headers.get('access-control-allow-origin');
    console.log('Access-Control-Allow-Origin:', allowOrigin);
    if (allowOrigin !== 'https://project-karthi-b0f29.web.app') {
      throw new Error(`Expected production origin in CORS header, got: ${allowOrigin}`);
    }
    console.log('✅ Production domain allowed by CORS');

    console.log('\n--- 4. Testing CORS for Localhost Frontend (Dev fallback) ---');
    const corsDevRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/health`, {
      headers: {
        Origin: 'http://localhost:5173',
      },
    });
    const allowDevOrigin = corsDevRes.headers.get('access-control-allow-origin');
    console.log('Access-Control-Allow-Origin for localhost:', allowDevOrigin);
    if (allowDevOrigin !== 'http://localhost:5173') {
      throw new Error(`Expected localhost origin in CORS header, got: ${allowDevOrigin}`);
    }
    console.log('✅ Localhost development domain allowed by CORS');

    console.log('\n======================================================');
    console.log('🎉 ALL BACKEND PRODUCTION READINESS CHECKS PASSED!');
    console.log('======================================================\n');
  } catch (err) {
    console.error('❌ Verification failed:', err.message);
    process.exitCode = 1;
  } finally {
    cleanup();
    setTimeout(() => process.exit(process.exitCode || 0), 500);
  }
}

runVerification();
