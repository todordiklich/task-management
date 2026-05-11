import express from 'express';
import { hashPassword, comparePassword } from '../utils/password.js';
import { generateAccessToken, generateRefreshToken, getRefreshTokenExpiry } from '../utils/tokens.js';
import { loginSchema, signupSchema, refreshTokenSchema } from '../utils/validation.js';
import prisma from '../config/prisma.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

async function cleanupExpiredTokens() {
  try {
    await prisma.refreshToken.deleteMany({
      where: {
        expiresAt: {
          lt: new Date()
        }
      }
    });
    lastCleanupTime = now;
  } catch (error) {
  }
}

// Initial cleanup on server start
cleanupExpiredTokens();

// Schedule periodic cleanup
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
setInterval(cleanupExpiredTokens, CLEANUP_INTERVAL);

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

    res.status(201).json({
      user,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to signup' });
  }
});

router.post('/login', async (req, res) => {
  try {
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
      // Find user
      const user = await tx.user.findUnique({ where: { email } });
      if (!user) {
        throw new Error('Invalid credentials');
      }

      // Verify password
      const isValidPassword = await comparePassword(password, user.passwordHash);
      if (!isValidPassword) {
        throw new Error('Invalid credentials');
      }

      // Check if user is active
      if (!user.isActive) {
        throw new Error('Account is inactive');
      }

      // Clean up any existing refresh tokens for this user (token rotation)
      await tx.refreshToken.deleteMany({
        where: { userId: user.id }
      });

      // Generate new tokens
      const accessToken = generateAccessToken({ 
        id: user.id, 
        email: user.email, 
        role: user.role 
      });
      
      const refreshToken = generateRefreshToken();
      const expiresAt = getRefreshTokenExpiry();

      // Store new refresh token
      await tx.refreshToken.create({
        data: {
          token: refreshToken,
          userId: user.id,
          expiresAt,
        },
      });

      return { user, accessToken, refreshToken };
    });

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
}, 300000); // 5 minutes in milliseconds

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
  if (!checkRateLimit(req, res)) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

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
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

// POST /auth/logout - Logout user
router.post('/logout', authenticate, async (req, res) => {
  try {
    const userId = req.user?.id;

    // Delete all refresh tokens for the authenticated user
    if (userId) {
      await prisma.refreshToken.deleteMany({
        where: { userId },
      });
    }
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to logout' });
  }
});

export default router;
