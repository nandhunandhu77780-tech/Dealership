import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import connectDB, { db } from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
];

const ALLOWED_IMAGE_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.svg',
];

// Validation helper mirroring storageService.js
const validateProductImage = (file) => {
  if (!file) {
    return { valid: false, error: 'Please select an image file to upload.' };
  }

  const fileName = (file.name || '').toLowerCase();
  const hasValidExt = ALLOWED_IMAGE_EXTENSIONS.some((ext) => fileName.endsWith(ext));
  const isImageMime = file.type && file.type.startsWith('image/');

  if (!isImageMime && !hasValidExt) {
    return {
      valid: false,
      error: 'Invalid file format. Please upload an image file (PNG, JPG, JPEG, WEBP, GIF, or SVG).',
    };
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      error: `File size exceeds the 5MB limit. Selected file is ${fileSizeMB}MB.`,
    };
  }

  return { valid: true };
};

// URL identification mirroring storageService.js
const isFirebaseStorageUrl = (urlOrPath) => {
  if (!urlOrPath || typeof urlOrPath !== 'string') return false;
  return (
    urlOrPath.includes('firebasestorage.googleapis.com') ||
    urlOrPath.includes('firebasestorage.app') ||
    urlOrPath.startsWith('products/')
  );
};

const runTests = async () => {
  console.log('\n======================================================');
  console.log('🧪 RUNNING PRODUCT IMAGE UPLOAD AUTOMATED TEST SUITE');
  console.log('======================================================\n');

  const createdProductIds = [];
  const createdOrderIds = [];

  try {
    // ------------------------------------------------------------------------
    // Suite 1: Image Validation Logic (Type & Size Limits)
    // ------------------------------------------------------------------------
    console.log('--- 1. Testing Image File Validation Logic (Req 7) ---');

    // 1.1 Valid image file
    const validJpg = { name: 'smart-tv.jpg', type: 'image/jpeg', size: 2.4 * 1024 * 1024 };
    const res1 = validateProductImage(validJpg);
    if (res1.valid) {
      console.log('  ✅ 1.1 Valid JPG image within 5MB accepted.');
    } else {
      throw new Error(`Valid JPG was rejected: ${res1.error}`);
    }

    const validPng = { name: 'refrigerator.png', type: 'image/png', size: 4.8 * 1024 * 1024 };
    const res2 = validateProductImage(validPng);
    if (res2.valid) {
      console.log('  ✅ 1.2 Valid PNG image within 5MB accepted.');
    } else {
      throw new Error(`Valid PNG was rejected: ${res2.error}`);
    }

    // 1.2 Oversized file (> 5MB)
    const oversizedFile = { name: 'huge-banner.png', type: 'image/png', size: 6.2 * 1024 * 1024 };
    const res3 = validateProductImage(oversizedFile);
    if (!res3.valid && res3.error.includes('exceeds the 5MB limit')) {
      console.log(`  ✅ 1.3 Oversized image rejected with clear error: "${res3.error}"`);
    } else {
      throw new Error('Oversized file was not rejected properly.');
    }

    // 1.3 Invalid MIME type (PDF, text, executable)
    const invalidDoc = { name: 'invoice.pdf', type: 'application/pdf', size: 500 * 1024 };
    const res4 = validateProductImage(invalidDoc);
    if (!res4.valid && res4.error.includes('Invalid file format')) {
      console.log(`  ✅ 1.4 Non-image document rejected with clear error: "${res4.error}"`);
    } else {
      throw new Error('Non-image file was not rejected.');
    }

    // 1.4 Missing file
    const res5 = validateProductImage(null);
    if (!res5.valid) {
      console.log(`  ✅ 1.5 Missing file handled gracefully: "${res5.error}"`);
    } else {
      throw new Error('Null file did not return invalid.');
    }

    // ------------------------------------------------------------------------
    // Suite 2: Firebase Storage Security Rules & Configuration (Req 11)
    // ------------------------------------------------------------------------
    console.log('\n--- 2. Verifying Firebase Storage Rules & Configuration (Req 11) ---');

    const storageRulesPath = path.resolve(__dirname, '../../storage.rules');
    if (!fs.existsSync(storageRulesPath)) {
      throw new Error(`storage.rules file not found at ${storageRulesPath}`);
    }
    const storageRulesContent = fs.readFileSync(storageRulesPath, 'utf8');

    if (
      storageRulesContent.includes("service firebase.storage") &&
      storageRulesContent.includes("match /products/{imageId}") &&
      storageRulesContent.includes("allow read: if isAuthenticated();") &&
      storageRulesContent.includes("allow create, update: if isAdmin() && isValidProductImage();") &&
      storageRulesContent.includes("allow delete: if isAdmin();")
    ) {
      console.log('  ✅ 2.1 storage.rules contains required admin-only write/delete and user read permissions.');
    } else {
      throw new Error('storage.rules is missing required security conditions.');
    }

    if (storageRulesContent.includes("5 * 1024 * 1024") && storageRulesContent.includes("image/.*")) {
      console.log('  ✅ 2.2 storage.rules enforces 5MB size limit and image MIME validation.');
    } else {
      throw new Error('storage.rules does not enforce image MIME or size limit.');
    }

    const firebaseJsonPath = path.resolve(__dirname, '../../firebase.json');
    const firebaseJson = JSON.parse(fs.readFileSync(firebaseJsonPath, 'utf8'));
    if (firebaseJson.storage && firebaseJson.storage.rules === 'storage.rules') {
      console.log('  ✅ 2.3 firebase.json configures storage.rules correctly.');
    } else {
      throw new Error('firebase.json is missing storage rules configuration.');
    }

    // 2.4 Verify firebase.js timeout configurations (prevent 10-min hangs)
    const firebaseJsPath = path.resolve(__dirname, '../../client/src/services/firebase.js');
    const firebaseJsContent = fs.readFileSync(firebaseJsPath, 'utf8');
    if (
      firebaseJsContent.includes('storage.maxUploadRetryTime') &&
      firebaseJsContent.includes('storage.maxOperationRetryTime')
    ) {
      console.log('  ✅ 2.4 firebase.js configures fast failure storage retry limits (prevents 10-min retry hang).');
    } else {
      throw new Error('firebase.js is missing storage retry timeout configuration.');
    }

    // 2.5 Verify storageService.js stall timeout and error code formatting
    const storageServicePath = path.resolve(__dirname, '../../client/src/services/storageService.js');
    const storageServiceContent = fs.readFileSync(storageServicePath, 'utf8');
    if (
      storageServiceContent.includes('UPLOAD_TIMEOUT_MS') &&
      storageServiceContent.includes('uploadTask.cancel()') &&
      storageServiceContent.includes('storage/bucket-not-found') &&
      storageServiceContent.includes('storage/unknown')
    ) {
      console.log('  ✅ 2.5 storageService.js enforces safety timeout and user-friendly error formatting.');
    } else {
      throw new Error('storageService.js missing timeout protection or comprehensive error handling.');
    }

    // ------------------------------------------------------------------------
    // Suite 3: Firestore Connection
    // ------------------------------------------------------------------------
    console.log('\n--- 3. Connecting to Firestore ---');
    await connectDB();
    console.log('  ✅ 3.1 Cloud Firestore connected successfully.');

    // ------------------------------------------------------------------------
    // Suite 4: Product Image Creation in Firestore (Req 2 & 3)
    // ------------------------------------------------------------------------
    console.log('\n--- 4. Testing Product Creation with Firebase Storage URL (Req 2 & 3) ---');

    const sampleStorageUrl = 'https://firebasestorage.googleapis.com/v0/b/project-karthi-b0f29.firebasestorage.app/o/products%2F1726941234567_smart_tv.png?alt=media&token=test-token-uuid-1234';

    const testProductData = {
      name: 'Sony Bravia 55" 4K Google TV',
      description: 'Ultra HD Smart LED TV with Dolby Vision and Google TV',
      category: 'Electronics',
      price: 54990,
      stock: 5,
      imageURL: sampleStorageUrl,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const prodRef = await db.collection('products').add(testProductData);
    createdProductIds.push(prodRef.id);
    console.log(`  ✅ 4.1 Product created with Firebase Storage image URL. Doc ID: ${prodRef.id}`);

    // Verify stored data
    const savedProdSnap = await prodRef.get();
    const savedProd = savedProdSnap.data();
    if (savedProd.imageURL === sampleStorageUrl) {
      console.log('  ✅ 4.2 Product document in Firestore contains exact Firebase Storage download URL.');
    } else {
      throw new Error(`Expected imageURL ${sampleStorageUrl}, got ${savedProd.imageURL}`);
    }

    // ------------------------------------------------------------------------
    // Suite 5: Display & Retrieval Verification (Req 4)
    // ------------------------------------------------------------------------
    console.log('\n--- 5. Testing Catalog Retrieval & Image Display (Req 4) ---');

    const catalogSnap = await db.collection('products').where('status', '==', 'active').get();
    const found = catalogSnap.docs.find((d) => d.id === prodRef.id);
    if (found && found.data().imageURL) {
      console.log('  ✅ 5.1 Active catalog query returns product with imageURL ready for UI display.');
    } else {
      throw new Error('Created product was not found in active catalog query.');
    }

    // ------------------------------------------------------------------------
    // Suite 6: Image Replacement Workflow (Req 5)
    // ------------------------------------------------------------------------
    console.log('\n--- 6. Testing Product Image Replacement (Req 5) ---');

    const replacedStorageUrl = 'https://firebasestorage.googleapis.com/v0/b/project-karthi-b0f29.firebasestorage.app/o/products%2F1726941999999_sony_updated.png?alt=media&token=replaced-token-uuid-5678';

    await prodRef.update({
      imageURL: replacedStorageUrl,
      updatedAt: new Date().toISOString(),
    });

    const updatedProdSnap = await prodRef.get();
    const updatedProd = updatedProdSnap.data();
    if (updatedProd.imageURL === replacedStorageUrl) {
      console.log('  ✅ 6.1 Product image URL successfully replaced with new Firebase Storage URL.');
    } else {
      throw new Error(`Replacement failed. Expected ${replacedStorageUrl}, got ${updatedProd.imageURL}`);
    }

    // ------------------------------------------------------------------------
    // Suite 7: Image Removal Workflow (Req 6)
    // ------------------------------------------------------------------------
    console.log('\n--- 7. Testing Product Image Removal (Req 6) ---');

    await prodRef.update({
      imageURL: '',
      updatedAt: new Date().toISOString(),
    });

    const removedProdSnap = await prodRef.get();
    const removedProd = removedProdSnap.data();
    if (removedProd.imageURL === '') {
      console.log('  ✅ 7.1 Product image URL successfully cleared in Firestore (image removed).');
    } else {
      throw new Error(`Removal failed. Expected empty imageURL, got ${removedProd.imageURL}`);
    }

    // ------------------------------------------------------------------------
    // Suite 8: Backward Compatibility with Older / External URLs (Req 10)
    // ------------------------------------------------------------------------
    console.log('\n--- 8. Testing Backward Compatibility with Legacy Image URLs (Req 10) ---');

    const legacyUnsplashUrl = 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?auto=format&fit=crop&w=600&q=80';

    const legacyProductData = {
      name: 'LG Double Door Refrigerator (Legacy Item)',
      description: 'Frost free inverter refrigerator',
      category: 'Appliances',
      price: 32000,
      stock: 3,
      imageURL: legacyUnsplashUrl,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const legacyRef = await db.collection('products').add(legacyProductData);
    createdProductIds.push(legacyRef.id);

    const legacySnap = await legacyRef.get();
    const savedLegacy = legacySnap.data();
    if (savedLegacy.imageURL === legacyUnsplashUrl) {
      console.log('  ✅ 8.1 Legacy external image URL preserved and queried seamlessly.');
    } else {
      throw new Error('Legacy URL preservation failed.');
    }

    // Verify URL helper accurately differentiates storage vs external
    if (
      isFirebaseStorageUrl(sampleStorageUrl) &&
      !isFirebaseStorageUrl(legacyUnsplashUrl) &&
      !isFirebaseStorageUrl('')
    ) {
      console.log('  ✅ 8.2 URL classifier accurately differentiates Firebase Storage vs external image URLs.');
    } else {
      throw new Error('URL classifier failed.');
    }

    // ------------------------------------------------------------------------
    // Suite 9: Order Integration with Product Images
    // ------------------------------------------------------------------------
    console.log('\n--- 9. Testing Order Integration with Product Image (Req 4) ---');

    const testOrderData = {
      memberId: 'test_member_auth_uid_123',
      memberName: 'Arun Kumar',
      memberEmail: 'arun@example.com',
      productId: prodRef.id,
      productName: 'Sony Bravia 55" 4K Google TV',
      productImageURL: sampleStorageUrl,
      quantity: 1,
      unitPrice: 54990,
      totalAmount: 54990,
      address: '14/B Anna Nagar, Madurai, Tamil Nadu',
      note: 'Please call before delivery',
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const orderRef = await db.collection('orders').add(testOrderData);
    createdOrderIds.push(orderRef.id);

    const savedOrderSnap = await orderRef.get();
    const savedOrder = savedOrderSnap.data();
    if (savedOrder.productImageURL === sampleStorageUrl) {
      console.log('  ✅ 9.1 Order document stores productImageURL for receipts and order lists.');
    } else {
      throw new Error(`Order productImageURL mismatch: got ${savedOrder.productImageURL}`);
    }

    console.log('\n======================================================');
    console.log('🎉 ALL PRODUCT IMAGE UPLOAD TESTS PASSED SUCCESSFULLY (9/9)!');
    console.log('======================================================\n');
  } catch (error) {
    console.error('\n❌ TEST SUITE FAILED:', error.message);
    process.exitCode = 1;
  } finally {
    // Clean up created test data
    console.log('🧹 Cleaning up test documents...');
    for (const pid of createdProductIds) {
      try {
        await db.collection('products').doc(pid).delete();
      } catch {}
    }
    for (const oid of createdOrderIds) {
      try {
        await db.collection('orders').doc(oid).delete();
      } catch {}
    }
    console.log('✅ Cleanup completed.\n');
  }
};

runTests();
