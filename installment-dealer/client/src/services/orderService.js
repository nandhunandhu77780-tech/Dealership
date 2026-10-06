import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  query,
  where,
  orderBy,
  runTransaction
} from 'firebase/firestore';
import { db } from './firebase.js';

const ORDERS_COLLECTION = 'orders';
const PRODUCTS_COLLECTION = 'products';

export const ORDER_STATUSES = ['pending', 'approved', 'rejected', 'completed'];

export const DELIVERY_STATUSES = [
  'Order Placed',
  'Approved',
  'Preparing',
  'Out for Delivery',
  'Delivered'
];

/**
 * Returns a normalized delivery status for an order
 * @param {object} order
 * @returns {string}
 */
export const getNormalizedDeliveryStatus = (order) => {
  if (!order) return 'Order Placed';
  if (order.deliveryStatus && DELIVERY_STATUSES.includes(order.deliveryStatus)) {
    return order.deliveryStatus;
  }
  // Safe fallback based on order.status
  if (order.status === 'completed') return 'Delivered';
  if (order.status === 'approved') return 'Approved';
  return 'Order Placed';
};

/**
 * Place a new order in Firestore
 * @param {object} orderData
 * @param {string} orderData.memberId
 * @param {string} orderData.memberName
 * @param {string} orderData.memberEmail
 * @param {string} orderData.productId
 * @param {string} orderData.productName
 * @param {number} orderData.quantity
 * @param {number} orderData.unitPrice
 * @param {string} orderData.address
 * @param {string} [orderData.note]
 * @returns {Promise<{ id: string, ...object }>}
 */
export const createOrder = async (orderData) => {
  const {
    memberId,
    memberName,
    memberPhone,
    memberCode,
    memberEmail,
    productId,
    productName,
    quantity,
    unitPrice,
    address,
    note = '',
  } = orderData;

  if (!memberId) throw new Error('Member ID is required to place an order.');
  if (!productId) throw new Error('Product ID is required.');
  if (!address || !address.trim()) throw new Error('Delivery/Address information is required.');

  const qty = parseInt(quantity, 10);
  if (isNaN(qty) || qty < 1) {
    throw new Error('Order quantity must be at least 1.');
  }

  const price = parseFloat(unitPrice);
  if (isNaN(price) || price < 0) {
    throw new Error('Unit price must be a valid non-negative number.');
  }

  // Verify product and current available stock
  const productRef = doc(db, PRODUCTS_COLLECTION, productId);
  const prodSnap = await getDoc(productRef);
  if (!prodSnap.exists()) {
    throw new Error('The selected product does not exist.');
  }

  const currentProduct = prodSnap.data();
  if (currentProduct.status !== 'active') {
    throw new Error('This product is currently inactive and cannot be purchased.');
  }

  const availableStock = parseInt(currentProduct.stock, 10) || 0;
  if (qty > availableStock) {
    throw new Error(`Requested quantity (${qty}) exceeds available stock (${availableStock}).`);
  }

  const totalAmount = parseFloat((qty * price).toFixed(2));

  const newOrder = {
    memberId,
    memberName: (memberName || 'Member').trim(),
    memberPhone: (memberPhone || orderData.phone || '').trim(),
    memberCode: (memberCode || '').trim(),
    memberEmail: (memberEmail || '').trim(),
    productId,
    productName: (productName || currentProduct.name || 'Product').trim(),
    productImageURL: (currentProduct.imageURL || '').trim(),
    quantity: qty,
    unitPrice: price,
    totalAmount,
    address: address.trim(),
    note: (note || '').trim(),
    status: 'pending',
    deliveryStatus: 'Order Placed',
    expectedDeliveryDate: null,
    deliveryNote: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const docRef = await addDoc(collection(db, ORDERS_COLLECTION), newOrder);
  return { id: docRef.id, ...newOrder };
};

/**
 * Fetch all orders for a specific member
 * @param {string} memberId
 * @returns {Promise<Array<{ id: string, ...object }>>}
 */
export const getOrdersByMember = async (memberId) => {
  if (!memberId) throw new Error('Member ID is required.');
  const ordersRef = collection(db, ORDERS_COLLECTION);

  try {
    const q = query(
      ordersRef,
      where('memberId', '==', memberId),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    // Fallback in case composite index is not yet generated
    const q = query(ordersRef, where('memberId', '==', memberId));
    const snapshot = await getDocs(q);
    const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    return docs.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }
};

/**
 * Fetch all orders in the system (Admin only)
 * @returns {Promise<Array<{ id: string, ...object }>>}
 */
export const getAllOrders = async () => {
  const ordersRef = collection(db, ORDERS_COLLECTION);
  try {
    const q = query(ordersRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    const snapshot = await getDocs(ordersRef);
    const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    return docs.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }
};

/**
 * Fetch a single order by ID
 * @param {string} id - Order Document ID
 * @returns {Promise<{ id: string, ...object } | null>}
 */
export const getOrderById = async (id) => {
  if (!id) throw new Error('Order ID is required.');
  const docRef = doc(db, ORDERS_COLLECTION, id);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
};

/**
 * Update the status of an order
 * When approved, atomically checks and decrements product stock to prevent negative inventory
 * @param {string} orderId
 * @param {'pending'|'approved'|'rejected'|'completed'} nextStatus
 * @returns {Promise<{ success: boolean, updatedStatus: string }>}
 */
export const updateOrderStatus = async (orderId, nextStatus) => {
  if (!orderId) throw new Error('Order ID is required.');
  if (!ORDER_STATUSES.includes(nextStatus)) {
    throw new Error(`Invalid status "${nextStatus}". Allowed: ${ORDER_STATUSES.join(', ')}`);
  }

  const orderRef = doc(db, ORDERS_COLLECTION, orderId);

  // If approving the order, execute an atomic transaction to decrement product stock
  if (nextStatus === 'approved') {
    await runTransaction(db, async (transaction) => {
      const orderDoc = await transaction.get(orderRef);
      if (!orderDoc.exists()) {
        throw new Error('Order not found.');
      }

      const orderData = orderDoc.data();

      // If already approved, do not reduce stock again
      if (orderData.status === 'approved') {
        return;
      }

      const productRef = doc(db, PRODUCTS_COLLECTION, orderData.productId);
      const prodDoc = await transaction.get(productRef);
      if (!prodDoc.exists()) {
        throw new Error(`Product "${orderData.productName}" was not found in inventory.`);
      }

      const prodData = prodDoc.data();
      const currentStock = parseInt(prodData.stock, 10) || 0;
      const orderQty = parseInt(orderData.quantity, 10) || 1;

      // Prevent negative stock
      if (currentStock < orderQty) {
        throw new Error(
          `Insufficient stock to approve order! Available: ${currentStock}, Ordered: ${orderQty}.`
        );
      }

      const newStock = currentStock - orderQty;

      // Decrement product stock
      transaction.update(productRef, {
        stock: newStock,
        updatedAt: new Date().toISOString(),
      });

      // Update order status
      const orderUpdates = {
        status: 'approved',
        approvedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Automatically advance delivery status to 'Approved' if currently 'Order Placed' or unset
      if (!orderData.deliveryStatus || orderData.deliveryStatus === 'Order Placed') {
        orderUpdates.deliveryStatus = 'Approved';
      }

      transaction.update(orderRef, orderUpdates);
    });

    return { success: true, updatedStatus: 'approved' };
  }

  // For other statuses (rejected, completed, pending):
  const updates = {
    status: nextStatus,
    updatedAt: new Date().toISOString(),
  };

  if (nextStatus === 'completed') {
    updates.deliveryStatus = 'Delivered';
    updates.deliveredAt = new Date().toISOString();
  }

  await updateDoc(orderRef, updates);

  return { success: true, updatedStatus: nextStatus };
};

/**
 * Update the delivery information of an order (Admin only)
 * Allows setting or updating expectedDeliveryDate, deliveryNote, and deliveryStatus
 * @param {string} orderId
 * @param {object} deliveryData
 * @param {string|null} [deliveryData.expectedDeliveryDate] - Expected delivery date (YYYY-MM-DD or null)
 * @param {string} [deliveryData.deliveryNote] - Optional notes from dealer/admin
 * @param {string} [deliveryData.deliveryStatus] - One of DELIVERY_STATUSES
 * @returns {Promise<{ success: boolean, orderId: string, ...object }>}
 */
export const updateOrderDeliveryDetails = async (orderId, deliveryData = {}) => {
  if (!orderId) throw new Error('Order ID is required.');

  const orderRef = doc(db, ORDERS_COLLECTION, orderId);
  const now = new Date().toISOString();
  const updateData = {
    updatedAt: now,
    deliveryUpdatedAt: now,
  };

  if ('expectedDeliveryDate' in deliveryData) {
    const rawDate = deliveryData.expectedDeliveryDate;
    updateData.expectedDeliveryDate = rawDate && typeof rawDate === 'string' && rawDate.trim() ? rawDate.trim() : null;
  }

  if ('lastNotifiedDeliveryDate' in deliveryData) {
    updateData.lastNotifiedDeliveryDate = deliveryData.lastNotifiedDeliveryDate || null;
  }

  if ('lastNotifiedDeliveryStatus' in deliveryData) {
    updateData.lastNotifiedDeliveryStatus = deliveryData.lastNotifiedDeliveryStatus || null;
  }

  if ('deliveryNote' in deliveryData) {
    updateData.deliveryNote = (deliveryData.deliveryNote || '').trim();
  }

  if ('deliveryStatus' in deliveryData && deliveryData.deliveryStatus) {
    const nextDeliveryStatus = deliveryData.deliveryStatus.trim();
    if (!DELIVERY_STATUSES.includes(nextDeliveryStatus)) {
      throw new Error(`Invalid delivery status "${nextDeliveryStatus}". Allowed: ${DELIVERY_STATUSES.join(', ')}`);
    }
    updateData.deliveryStatus = nextDeliveryStatus;
    if (nextDeliveryStatus === 'Delivered') {
      updateData.deliveredAt = now;
    }
  }

  await updateDoc(orderRef, updateData);
  return { success: true, orderId, ...updateData };
};
