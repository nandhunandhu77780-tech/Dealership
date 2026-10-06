import express from 'express';
import { getHealth } from '../controllers/healthController.js';

const router = express.Router();

// GET /api/health
router.get('/health', getHealth);

export default router;
