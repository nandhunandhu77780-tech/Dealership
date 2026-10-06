import { getAuth } from 'firebase-admin/auth';

/**
 * Middleware to authenticate requests using Firebase Auth ID token
 */
export const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. Please provide a valid authorization token.',
    });
  }

  const token = authHeader.split('Bearer ')[1].trim();

  try {
    const decodedToken = await getAuth().verifyIdToken(token);
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email || '',
      name: decodedToken.name || decodedToken.display_name || '',
      role: decodedToken.role || 'member',
      ...decodedToken,
    };
    next();
  } catch (error) {
    // Check if development test bypass token is present (only for unit test scripts)
    if (process.env.NODE_ENV !== 'production' && token.startsWith('test_member_token_')) {
      const testUid = token.replace('test_member_token_', '');
      req.user = {
        uid: testUid,
        email: `${testUid}@example.com`,
        name: 'Test Member',
        role: 'member',
      };
      return next();
    }

    console.error('Auth verification failed:', error.message);
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired authentication token. Please log in again.',
    });
  }
};
