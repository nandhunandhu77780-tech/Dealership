import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
} from 'firebase/firestore';
import { db } from './firebase.js';

const PRODUCTS_COLLECTION = 'products';

export const PRODUCT_CATEGORIES = [
  'Electronics',
  'Home Appliances',
  'Furniture',
  'Other',
];

/**
 * Create a new product in Firestore
 * @param {object} productData
 * @param {string} productData.name
 * @param {string} [productData.description]
 * @param {string} productData.category
 * @param {number|string} productData.price
 * @param {number|string} productData.stock
 * @param {string} [productData.imageURL]
 * @param {string} [productData.status='active']
 * @returns {Promise<{ id: string, ...object }>}
 */
export const createProduct = async (productData) => {
  const productsRef = collection(db, PRODUCTS_COLLECTION);

  const priceNum = parseFloat(productData.price);
  const stockNum = parseInt(productData.stock, 10);

  if (isNaN(priceNum) || priceNum < 0) {
    throw new Error('Price must be a valid number greater than or equal to 0');
  }

  if (isNaN(stockNum) || stockNum < 0) {
    throw new Error('Stock must be a valid non-negative number');
  }

  const newProduct = {
    name: productData.name ? productData.name.trim() : '',
    description: productData.description ? productData.description.trim() : '',
    category: productData.category ? productData.category.trim() : 'Other',
    price: priceNum,
    stock: stockNum,
    imageURL: productData.imageURL ? productData.imageURL.trim() : '',
    googleDriveFileId: productData.googleDriveFileId ? productData.googleDriveFileId.trim() : '',
    googleDriveFileName: productData.googleDriveFileName ? productData.googleDriveFileName.trim() : '',
    imageSource: productData.imageSource || (productData.googleDriveFileId ? 'google_drive' : ''),
    status: productData.status === 'inactive' ? 'inactive' : 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const docRef = await addDoc(productsRef, newProduct);
  return { id: docRef.id, ...newProduct };
};

/**
 * Fetch all products from Firestore
 * @returns {Promise<Array<{ id: string, ...object }>>}
 */
export const getProducts = async () => {
  const productsRef = collection(db, PRODUCTS_COLLECTION);
  try {
    const q = query(productsRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    // Fallback if index is not present
    const snapshot = await getDocs(productsRef);
    const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    return docs.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }
};

/**
 * Update an existing product in Firestore
 * @param {string} id - Document ID
 * @param {object} productData
 * @returns {Promise<void>}
 */
export const updateProduct = async (id, productData) => {
  if (!id) throw new Error('Product document ID is required for update');
  const docRef = doc(db, PRODUCTS_COLLECTION, id);

  const updatedFields = {
    updatedAt: new Date().toISOString(),
  };

  if (productData.name !== undefined) updatedFields.name = productData.name.trim();
  if (productData.description !== undefined) updatedFields.description = productData.description.trim();
  if (productData.category !== undefined) updatedFields.category = productData.category.trim();
  if (productData.imageURL !== undefined) updatedFields.imageURL = productData.imageURL.trim();
  if (productData.googleDriveFileId !== undefined) {
    updatedFields.googleDriveFileId = productData.googleDriveFileId ? productData.googleDriveFileId.trim() : '';
  }
  if (productData.googleDriveFileName !== undefined) {
    updatedFields.googleDriveFileName = productData.googleDriveFileName ? productData.googleDriveFileName.trim() : '';
  }
  if (productData.imageSource !== undefined) {
    updatedFields.imageSource = productData.imageSource;
  }
  if (productData.status !== undefined) {
    updatedFields.status = productData.status === 'inactive' ? 'inactive' : 'active';
  }

  if (productData.price !== undefined) {
    const p = parseFloat(productData.price);
    if (isNaN(p) || p < 0) throw new Error('Price must be greater than or equal to 0');
    updatedFields.price = p;
  }

  if (productData.stock !== undefined) {
    const s = parseInt(productData.stock, 10);
    if (isNaN(s) || s < 0) throw new Error('Stock must be a non-negative number');
    updatedFields.stock = s;
  }

  await updateDoc(docRef, updatedFields);
};

/**
 * Delete a product from Firestore
 * @param {string} id - Document ID
 * @returns {Promise<void>}
 */
export const deleteProduct = async (id) => {
  if (!id) throw new Error('Product document ID is required for deletion');
  const docRef = doc(db, PRODUCTS_COLLECTION, id);
  await deleteDoc(docRef);
};

/**
 * Toggle active/inactive status for a product
 * @param {string} id
 * @param {string} currentStatus
 * @returns {Promise<string>} newStatus
 */
export const toggleProductStatus = async (id, currentStatus) => {
  const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
  await updateProduct(id, { status: newStatus });
  return newStatus;
};

/**
 * Fetch a single product by ID from Firestore
 * @param {string} id - Product document ID
 * @returns {Promise<{ id: string, ...object } | null>}
 */
export const getProductById = async (id) => {
  if (!id) throw new Error('Product document ID is required');
  const docRef = doc(db, PRODUCTS_COLLECTION, id);
  const snap = await getDoc(docRef);
  if (!snap.exists()) {
    return null;
  }
  return { id: snap.id, ...snap.data() };
};

/**
 * Fetch all active products that have available stock (> 0)
 * Designed for Member Product Catalog
 * @returns {Promise<Array<{ id: string, ...object }>>}
 */
export const getActiveInStockProducts = async () => {
  const allProducts = await getProducts();
  return allProducts.filter(
    (product) => product.status === 'active' && Number(product.stock) > 0
  );
};

