import express from 'express';
import { PrismaClient } from '@prisma/client';
import { hashPassword, comparePassword } from '../utils/password.js';
import { generateAccessToken, generateRefreshToken, getRefreshTokenExpiry } from '../utils/tokens.js';
import { loginSchema, signupSchema, refreshTokenSchema } from '../utils/validation.js';
import prisma from '../config/prisma.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Clean up expired refresh tokens (utility function)
async function cleanupExpiredTokens() {
  try {
    await prisma.refreshToken.deleteMany({
      where: {
        expiresAt: {
          lt: new Date()
        }
      }
    });
  } catch (error) {
    // Silently ignore cleanup errors
  }
}

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
    
    // Find user
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const isValidPassword = await comparePassword(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({ error: 'Account is inactive' });
    }

    // Clean up any existing refresh tokens for this user (token rotation)
    await prisma.refreshToken.deleteMany({
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
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt,
      },
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to login' });
  }
});

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

    // Clean up expired tokens periodically
    await cleanupExpiredTokens();

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    // Find refresh token in database
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!storedToken) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    // Check if token is expired
    if (storedToken.expiresAt < new Date()) {
      // Clean up expired token
      await prisma.refreshToken.delete({ where: { id: storedToken.id } });
      return res.status(401).json({ error: 'Refresh token expired' });
    }

    // Check if user is active
    if (!storedToken.user.isActive) {
      // Clean up token for inactive user
      await prisma.refreshToken.delete({ where: { id: storedToken.id } });
      return res.status(401).json({ error: 'Account is inactive' });
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
    await prisma.$transaction([
      prisma.refreshToken.delete({ where: { id: storedToken.id } }),
      prisma.refreshToken.create({
        data: {
          token: newRefreshToken,
          userId: storedToken.userId,
          expiresAt,
        },
      }),
    ]);

    res.json({
      accessToken,
      refreshToken: newRefreshToken,
      user: {
        id: storedToken.user.id,
        email: storedToken.user.email,
        name: storedToken.user.name,
        role: storedToken.user.role,
      },
    });
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
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
