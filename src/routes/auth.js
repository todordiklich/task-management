import express from 'express';
import { hashPassword, comparePassword } from '../utils/password.js';
import { generateAccessToken, generateRefreshToken, getRefreshTokenExpiry } from '../utils/tokens.js';
import { loginSchema, signupSchema, refreshTokenSchema } from '../utils/validation.js';
import prisma from '../config/prisma.js';
import { authenticate } from '../middleware/auth.js';
import logger from '../utils/logger.js';

const router = express.Router();

async function cleanupExpiredTokens() {
  try {
    await prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
  } catch (error) {
    logger.warn('Failed to cleanup expired tokens', { error: error.message });
  }
}

// Initial cleanup on server start
cleanupExpiredTokens();

// Schedule periodic cleanup
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
setInterval(cleanupExpiredTokens, CLEANUP_INTERVAL).unref();

// Generate tokens and store refresh token
async function generateTokensForUser(userId) {
  const accessToken = generateAccessToken({ id: userId });
  const refreshToken = generateRefreshToken();
  const expiresAt = getRefreshTokenExpiry();

  // Store refresh token in database
  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId,
      expiresAt,
    },
  });

  return { accessToken, refreshToken };
}

// POST /auth/signup - Register new user
router.post('/signup', async (req, res) => {
  try {
    logger.info('User signup attempt', { ip: req.ip, userAgent: req.get('User-Agent') });
    // Validate request body
    const validationResult = signupSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Invalid request data',
        details: validationResult.error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      });
    }

    const { email, password, name } = validationResult.data;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });

    // Generate tokens
    const { accessToken, refreshToken } = await generateTokensForUser(user.id);

    logger.info('User signup successful', { userId: user.id, email: user.email });
    res.status(201).json({
      user,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    logger.error('Signup failed', { error: error.message, ip: req.ip });
    res.status(500).json({ error: 'Failed to signup' });
  }
});

router.post('/login', async (req, res) => {
  try {
    logger.info('User login attempt', { ip: req.ip, email: req.body?.email, userAgent: req.get('User-Agent') });
    
    // Validate request body
    const validationResult = loginSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Invalid request data',
        details: validationResult.error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      });
    }

    const { email, password } = validationResult.data;
    
    // Use transaction for atomic login operations
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { email } });
      if (!user) {
        logger.security('Login failed - user not found', { email, ip: req.ip });
        throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });
      }

      const isValidPassword = await comparePassword(password, user.passwordHash);
      if (!isValidPassword) {
        logger.security('Login failed - invalid password', { email, ip: req.ip });
        throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });
      }

      if (!user.isActive) {
        logger.security('Login failed - inactive account', { email, ip: req.ip });
        throw Object.assign(new Error('Account is inactive'), { statusCode: 401 });
      }

      await tx.refreshToken.deleteMany({ where: { userId: user.id } });

      const accessToken = generateAccessToken({ id: user.id, email: user.email, role: user.role });
      const refreshToken = generateRefreshToken();
      const expiresAt = getRefreshTokenExpiry();

      await tx.refreshToken.create({
        data: { token: refreshToken, userId: user.id, expiresAt },
      });

      return { user, accessToken, refreshToken };
    });

    logger.info('User login successful', { userId: result.user.id, email: result.user.email, ip: req.ip });
    res.json({
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role,
      },
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    logger.error('Login failed', { error: error.message, ip: req.ip });
    res.status(500).json({ error: 'Failed to login' });
  }
});

// Rate limiting middleware with automatic cleanup
const rateLimit = new Map();

// Clean up old rate limit records every 5 minutes
setInterval(() => {
  const now = Date.now();
  const windowMs = 60000; // 1 minute window
  
  for (const [key, record] of rateLimit.entries()) {
    if (now - record.timestamp > windowMs * 10) { // Clean up records older than 10 windows
      rateLimit.delete(key);
    }
  }
}, 300000).unref(); // 5 minutes in milliseconds

function checkRateLimit(req, res, limit = 5, windowMs = 60000) {
  const key = `rate_limit_${req.ip || req.connection.remoteAddress}`;
  const now = Date.now();
  const record = rateLimit.get(key);

  if (!record) {
    rateLimit.set(key, { count: 1, timestamp: now });
    return true;
  }

  const timeDiff = now - record.timestamp;
  const isWithinWindow = timeDiff < windowMs;

  if (isWithinWindow && record.count < limit) {
    rateLimit.set(key, { count: record.count + 1, timestamp: now });
    return true;
  }

  if (!isWithinWindow) {
    rateLimit.set(key, { count: 1, timestamp: now });
    return true;
  }

  return false;
}

// POST /auth/refresh - Refresh access token
router.post('/refresh', async (req, res) => {
  try {
    // Validate request body
    const validationResult = refreshTokenSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Invalid request data',
        details: validationResult.error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      });
    }

    const { refreshToken } = validationResult.data;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    // Use transaction for atomic operations with pessimistic locking
    const result = await prisma.$transaction(async (tx) => {
      // Find and lock refresh token with pessimistic concurrency control
      const storedToken = await tx.refreshToken.findUnique({
        where: { token: refreshToken },
        include: { user: true },
      });

      if (!storedToken) {
        throw new Error('Invalid refresh token');
      }

      // Check if token is expired
      if (storedToken.expiresAt < new Date()) {
        // Clean up expired token
        await tx.refreshToken.delete({ where: { id: storedToken.id } });
        throw new Error('Refresh token expired');
      }

      // Check if user is active
      if (!storedToken.user.isActive) {
        // Clean up token for inactive user
        await tx.refreshToken.delete({ where: { id: storedToken.id } });
        throw new Error('Account is inactive');
      }

      // Generate new access token
      const accessToken = generateAccessToken({ 
        id: storedToken.user.id, 
        email: storedToken.user.email, 
        role: storedToken.user.role 
      });
      
      // Generate new refresh token (rotation)
      const newRefreshToken = generateRefreshToken();
      const expiresAt = getRefreshTokenExpiry();

      // Delete old refresh token and create new one (atomic rotation)
      await tx.refreshToken.delete({ where: { id: storedToken.id } });
      const newTokenRecord = await tx.refreshToken.create({
        data: {
          token: newRefreshToken,
          userId: storedToken.userId,
          expiresAt,
        },
      });

      return { accessToken, newRefreshToken, user: storedToken.user };
    });

    res.json({
      accessToken: result.accessToken,
      refreshToken: result.newRefreshToken,
      user: result.user,
    });
  } catch (error) {
    logger.error('Refresh token failed', { error: error.message, ip: req.ip });
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

// POST /auth/logout - Logout user
router.post('/logout', authenticate, async (req, res) => {
  try {
    const userId = req.user?.id;

    logger.info('User logout attempt', { userId, ip: req.ip });

    // Delete all refresh tokens for the authenticated user
    if (userId) {
      await prisma.refreshToken.deleteMany({
        where: { userId },
      });
    }
    
    logger.info('User logout successful', { userId, ip: req.ip });
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    logger.error('Logout failed', { error: error.message, userId: req.user?.id, ip: req.ip });
    res.status(500).json({ error: 'Failed to logout' });
  }
});

export default router;
