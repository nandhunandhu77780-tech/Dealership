/**
 * Utility formatters and error sanitizers for the Nandhana Agencies Management System.
 * Ensures consistent Indian Rupee formatting, readable Indian dates, and user-friendly error messages.
 */

/**
 * Format currency in Indian Rupees (₹) with proper grouping (en-IN).
 * @param {number|string} val - Numeric value to format
 * @param {boolean} [showSymbol=true] - Whether to prepend the ₹ symbol
 * @returns {string} Formatted string like "₹1,23,456.00"
 */
export const formatINR = (val, showSymbol = true) => {
  if (val === undefined || val === null || val === '' || isNaN(Number(val))) {
    return showSymbol ? '₹0.00' : '0.00';
  }
  const formatted = Number(val).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return showSymbol ? `₹${formatted}` : formatted;
};

/**
 * Format dates consistently into a readable Indian date format.
 * Prevents UTC-to-local timezone day-shift bugs by parsing YYYY-MM-DD locally.
 * @param {string|Date} dateStr - ISO string, YYYY-MM-DD, or Date object
 * @param {boolean} [includeTime=false] - Whether to append 12-hour Indian time
 * @returns {string} Formatted date like "19 Sep 2026" or "19 Sep 2026, 03:30 PM"
 */
export const formatIndianDate = (dateStr, includeTime = false) => {
  if (!dateStr) return 'N/A';
  try {
    let d;
    if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
      const [year, month, day] = dateStr.trim().split('-').map(Number);
      d = new Date(year, month - 1, day);
    } else {
      d = new Date(dateStr);
    }
    if (isNaN(d.getTime())) return String(dateStr);

    const dateOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    };

    if (includeTime) {
      dateOptions.hour = '2-digit';
      dateOptions.minute = '2-digit';
      dateOptions.hour12 = true;
    }

    return d.toLocaleDateString('en-IN', dateOptions);
  } catch {
    return String(dateStr);
  }
};

/**
 * Convert any date input into the user's local YYYY-MM-DD string.
 * Completely immune to UTC parsing timezone day-shifts.
 *
 * @param {string|Date|number} [dateInput=new Date()]
 * @returns {string} Local date string in YYYY-MM-DD format
 */
export const getLocalDateString = (dateInput = new Date()) => {
  if (!dateInput) return '';

  // If already a YYYY-MM-DD string, return it directly to avoid timezone distortion
  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
      const d = new Date(trimmed);
      if (!isNaN(d.getTime())) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
      return trimmed.slice(0, 10);
    }
  }

  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Calculate the number of calendar days an installment is overdue.
 * Uses local calendar date boundaries to eliminate timezone and DST discrepancies.
 *
 * @param {string|Date} dueDateInput - Installment due date
 * @param {string|Date} [referenceDate=new Date()] - Reference date (default: today)
 * @returns {number} Days overdue (>= 1 if overdue, 0 if not overdue)
 */
export const getOverdueDays = (dueDateInput, referenceDate = new Date()) => {
  const due = getLocalDateString(dueDateInput);
  const today = getLocalDateString(referenceDate);
  if (!due || !today || due >= today) return 0;

  const [y1, m1, d1] = due.split('-').map(Number);
  const [y2, m2, d2] = today.split('-').map(Number);
  const dt1 = new Date(y1, m1 - 1, d1);
  const dt2 = new Date(y2, m2 - 1, d2);
  const diffMs = dt2.getTime() - dt1.getTime();
  return Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
};

/**
 * Calculate remaining balance for a specific installment item.
 *
 * @param {object} installment - { amount, paidAmount }
 * @returns {number} Non-negative remaining amount rounded to 2 decimal places
 */
export const getInstallmentRemainingAmount = (installment) => {
  if (!installment) return 0;
  const amount = parseFloat(installment.amount) || 0;
  const paid = parseFloat(installment.paidAmount) || 0;
  return parseFloat(Math.max(0, amount - paid).toFixed(2));
};

/**
 * Automatically determine installment status from the current date and payment data.
 *
 * Rules:
 * - Remaining amount = 0 -> 'Paid'
 * - Due date is today and remaining amount > 0 -> 'Due Today'
 * - Due date is in the future -> 'Upcoming'
 * - Due date has passed and remaining amount > 0 -> 'Overdue'
 *
 * Additional requirements:
 * - Partially paid installments remain 'Overdue' if their due date has passed and balance remains.
 * - Paid installments NEVER appear as overdue, even if due date is in the past.
 * - Uses the user's local date to avoid timezone errors.
 *
 * @param {object} installment - Installment object with { amount, paidAmount, dueDate }
 * @param {string|Date} [referenceDate=new Date()] - Local reference date
 * @returns {'Paid' | 'Due Today' | 'Upcoming' | 'Overdue'}
 */
export const getInstallmentStatus = (installment, referenceDate = new Date()) => {
  if (!installment) return 'Upcoming';

  const remaining = getInstallmentRemainingAmount(installment);

  // Rule: Remaining amount = 0 -> Paid (Paid installments never appear as overdue)
  if (remaining <= 0) {
    return 'Paid';
  }

  const todayStr = getLocalDateString(referenceDate);
  const dueStr = getLocalDateString(installment.dueDate);

  if (!dueStr) {
    return 'Upcoming';
  }

  // Compare local calendar date strings (YYYY-MM-DD)
  if (dueStr === todayStr) {
    return 'Due Today';
  } else if (dueStr < todayStr) {
    return 'Overdue';
  } else {
    return 'Upcoming';
  }
};

/**
 * Decorate an installment object with dynamic computed status and metadata.
 * Does not mutate the original object.
 *
 * @param {object} installment
 * @param {string|Date} [referenceDate=new Date()]
 * @returns {object} Enriched installment with { status, remainingAmount, isOverdue, isDueToday, isPaid, isUpcoming, overdueDays }
 */
export const enrichInstallment = (installment, referenceDate = new Date()) => {
  if (!installment) return null;
  const status = getInstallmentStatus(installment, referenceDate);
  const remainingAmount = getInstallmentRemainingAmount(installment);
  const isOverdue = status === 'Overdue';
  const isDueToday = status === 'Due Today';
  const isPaid = status === 'Paid';
  const isUpcoming = status === 'Upcoming';
  const overdueDays = isOverdue ? getOverdueDays(installment.dueDate, referenceDate) : 0;

  return {
    ...installment,
    status, // Dynamically computed: 'Paid' | 'Due Today' | 'Upcoming' | 'Overdue'
    remainingAmount,
    isOverdue,
    isDueToday,
    isPaid,
    isUpcoming,
    overdueDays,
  };
};

/**
 * Sanitize technical Firebase or network errors into human-readable messages.
 * Prevents raw internal error codes from surfacing to users.
 * @param {Error|object|string} err - Caught error object or message string
 * @param {string} [fallbackMessage='An unexpected error occurred. Please try again.']
 * @returns {string} Clean, friendly error message
 */
export const sanitizeErrorMessage = (err, fallbackMessage = 'An unexpected error occurred. Please try again.') => {
  if (!err) return fallbackMessage;

  const code = typeof err === 'object' && err !== null ? err.code || '' : '';
  const rawMessage = typeof err === 'object' && err !== null ? err.message || '' : String(err);

  // Authentication errors
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
    return 'Invalid email or password. Please verify your credentials.';
  }
  if (code === 'auth/user-not-found') {
    return 'No account exists with this email address.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'An account with this email address already exists.';
  }
  if (code === 'auth/invalid-email') {
    return 'Please provide a valid email address.';
  }
  if (code === 'auth/weak-password') {
    return 'Password is too weak. Please use at least 6 characters.';
  }
  if (code === 'auth/popup-closed-by-user') {
    return 'Google sign-in pop-up was closed before completion.';
  }
  if (code === 'auth/cancelled-popup-request') {
    return 'Another sign-in request is already in progress.';
  }
  if (code === 'auth/popup-blocked') {
    return 'Sign-in pop-up was blocked by your browser. Please allow pop-ups and try again.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Too many attempts. Please wait a few moments before trying again.';
  }
  if (code === 'auth/user-disabled') {
    return 'This account has been deactivated. Please contact the administrator.';
  }
  if (code === 'auth/unauthorized-domain' || rawMessage.includes('unauthorized-domain')) {
    return 'This domain is not authorized for authentication in Firebase Console.';
  }
  if (code === 'auth/operation-not-allowed' || rawMessage.includes('operation-not-allowed')) {
    return 'This sign-in method is not enabled in Firebase Console.';
  }
  if (
    code.includes('identitytoolkit') ||
    rawMessage.includes('identitytoolkit') ||
    code.includes('api-key-service-blocked') ||
    rawMessage.includes('API_KEY_SERVICE_BLOCKED')
  ) {
    return 'Authentication is blocked for this API key. In Google Cloud Console, enable "Identity Toolkit API" under API restrictions for your API key.';
  }
  if (code.includes('requests-from-referer') || rawMessage.includes('requests-from-referer')) {
    return 'Requests from this domain are blocked by the API key restrictions. Please add your domain to the API key allowed websites in Google Cloud Console.';
  }

  // Firestore / Network errors
  if (code === 'permission-denied' || rawMessage.includes('permission-denied')) {
    return 'You do not have permission to perform this action.';
  }
  if (code === 'unavailable' || code === 'auth/network-request-failed' || rawMessage.includes('network')) {
    return 'Network connection issue. Please check your internet connection and try again.';
  }
  if (code === 'not-found' || rawMessage.includes('not found')) {
    return 'The requested record could not be found.';
  }
  if (code === 'already-exists') {
    return 'A record with these details already exists.';
  }
  if (code === 'resource-exhausted') {
    return 'Service quota temporarily exceeded. Please try again in a moment.';
  }

  // Clean Firebase wrapper prefixes and present real error message if present
  if (rawMessage) {
    const cleaned = rawMessage
      .replace(/^Firebase:\s*(Error\s*)?/i, '')
      .replace(/^\(([^)]+)\)\.?\s*/i, '')
      .trim();
    if (cleaned && cleaned !== 'Error' && cleaned !== 'FirebaseError') {
      return cleaned;
    }
  }

  return fallbackMessage;
};
