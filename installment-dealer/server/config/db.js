import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db = null;

/**
 * Format private key to handle escaped newlines and quote wrappers
 */
const formatPrivateKey = (key) => {
  if (!key) return undefined;
  return key.replace(/\\n/g, '\n').replace(/^["']|["']$/g, '');
};

/**
 * Automatically adjust for system clock skew against Google servers.
 * Prevents "16 UNAUTHENTICATED / invalid_grant: Invalid JWT timeframe" errors.
 */
const adjustTimeSkewIfNeeded = async () => {
  try {
    const res = await fetch('https://www.google.com', { method: 'HEAD' });
    const serverDateHeader = res.headers.get('date');
    if (serverDateHeader) {
      const serverTime = new Date(serverDateHeader).getTime();
      const localTime = Date.now();
      const offset = serverTime - localTime;

      // If clock is off by more than 60 seconds, calibrate in-process Date
      if (Math.abs(offset) > 60000) {
        const OrigDate = Date;
        global.Date = class extends OrigDate {
          constructor(...args) {
            if (args.length === 0) {
              super(OrigDate.now() + offset);
            } else {
              super(...args);
            }
          }
          static now() {
            return OrigDate.now() + offset;
          }
        };
      }
    }
  } catch {
    // If network check fails, proceed with system time
  }
};

/**
 * Find service account key file path if available
 */
const resolveServiceAccountPath = () => {
  const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (envPath) {
    const candidateCwd = path.resolve(process.cwd(), envPath);
    if (fs.existsSync(candidateCwd)) return candidateCwd;
    const candidateDir = path.resolve(__dirname, envPath);
    if (fs.existsSync(candidateDir)) return candidateDir;
  }
  const defaultPath = path.join(__dirname, 'serviceAccountKey.json');
  if (fs.existsSync(defaultPath)) return defaultPath;
  return null;
};

/**
 * Initialize Firebase Admin SDK and connect to Cloud Firestore
 */
const connectDB = async () => {
  try {
    await adjustTimeSkewIfNeeded();

    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = formatPrivateKey(process.env.FIREBASE_PRIVATE_KEY);
    const resolvedKeyPath = resolveServiceAccountPath();

    if (getApps().length === 0) {
      if (resolvedKeyPath) {
        const serviceAccount = JSON.parse(fs.readFileSync(resolvedKeyPath, 'utf8'));
        initializeApp({
          credential: cert(serviceAccount),
        });
      } else if (projectId && clientEmail && privateKey) {
        initializeApp({
          credential: cert({
            projectId,
            clientEmail,
            privateKey,
          }),
        });
      } else {
        throw new Error(
          'Missing Firebase credentials. Please place serviceAccountKey.json in server/config/ or configure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in .env.'
        );
      }
    }

    db = getFirestore();

    // Verify Firestore connectivity by querying collection metadata
    await db.listCollections();

    console.log('Firebase Firestore connected successfully');
    return db;
  } catch (error) {
    console.error(`Firebase Firestore connection failed: ${error.message}`);
    process.exit(1);
  }
};

export { db, getFirestore, connectDB };
export default connectDB;
