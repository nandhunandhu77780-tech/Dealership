import {
  validateProductImage,
  formatStorageError,
  isFirebaseStorageUrl,
  UPLOAD_TIMEOUT_MS,
  MAX_IMAGE_SIZE_BYTES,
  ALLOWED_IMAGE_TYPES,
} from './storageService.js';

console.log('\n======================================================');
console.log('🧪 RUNNING STORAGESERVICE UNIT TESTS');
console.log('======================================================\n');

let passed = 0;
let total = 0;

const assert = (condition, desc) => {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✅ ${desc}`);
  } else {
    console.error(`  ❌ FAILED: ${desc}`);
    process.exitCode = 1;
  }
};

// 1. Constants & Configuration
assert(UPLOAD_TIMEOUT_MS === 15000, 'UPLOAD_TIMEOUT_MS is 15000 (15 seconds)');
assert(MAX_IMAGE_SIZE_BYTES === 5 * 1024 * 1024, 'MAX_IMAGE_SIZE_BYTES is 5MB');
assert(ALLOWED_IMAGE_TYPES.includes('image/jpeg'), 'ALLOWED_IMAGE_TYPES includes image/jpeg');
assert(ALLOWED_IMAGE_TYPES.includes('image/png'), 'ALLOWED_IMAGE_TYPES includes image/png');

// 2. Validation
const validJpg = { name: 'phone.jpg', type: 'image/jpeg', size: 1024 * 1024 };
assert(validateProductImage(validJpg).valid === true, 'Valid JPG file passes validation');

const validPng = { name: 'laptop.png', type: 'image/png', size: 2 * 1024 * 1024 };
assert(validateProductImage(validPng).valid === true, 'Valid PNG file passes validation');

const oversized = { name: 'big.png', type: 'image/png', size: 6 * 1024 * 1024 };
const resOver = validateProductImage(oversized);
assert(resOver.valid === false && resOver.error.includes('exceeds the 5MB limit'), 'Oversized file fails with clear 5MB limit message');

const invalidDoc = { name: 'notes.pdf', type: 'application/pdf', size: 100 * 1024 };
const resDoc = validateProductImage(invalidDoc);
assert(resDoc.valid === false && resDoc.error.includes('Invalid file format'), 'PDF file fails with invalid format message');

assert(validateProductImage(null).valid === false, 'Null file fails validation');

// 3. Error code formatting (preventing raw cryptic errors and 0% hang)
assert(
  formatStorageError({ code: 'storage/bucket-not-found' }).includes('Firebase Console'),
  'storage/bucket-not-found instructs admin to activate Cloud Storage in Firebase Console'
);

assert(
  formatStorageError({ code: 'storage/unauthorized' }).includes('authenticated administrators'),
  'storage/unauthorized displays clear admin permission message'
);

assert(
  formatStorageError({ code: 'storage/unauthenticated' }).includes('sign in as an administrator'),
  'storage/unauthenticated displays sign-in requirement'
);

assert(
  formatStorageError({ code: 'storage/retry-limit-exceeded' }).includes('Upload timed out'),
  'storage/retry-limit-exceeded displays clear timeout message'
);

assert(
  formatStorageError({ code: 'storage/unknown', message: 'Not Found' }).includes('not reachable or not activated yet'),
  'storage/unknown with Not Found displays clear activation guidance'
);

assert(
  formatStorageError({ code: 'storage/quota-exceeded' }).includes('quota exceeded'),
  'storage/quota-exceeded formatted clearly'
);

// 4. URL detection
const fbUrl = 'https://firebasestorage.googleapis.com/v0/b/project-karthi-b0f29.firebasestorage.app/o/products%2F123.jpg';
assert(isFirebaseStorageUrl(fbUrl) === true, 'Firebase Storage download URL identified');

const externalUrl = 'https://images.unsplash.com/photo-12345?w=500';
assert(isFirebaseStorageUrl(externalUrl) === false, 'External image URL not classified as Firebase Storage');

console.log(`\nResults: ${passed} / ${total} tests passed.`);
if (passed === total) {
  console.log('🎉 All storageService unit tests passed!\n');
}
