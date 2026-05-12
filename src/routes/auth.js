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

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication endpoints
 */

/**
 * @swagger
 * /auth/signup:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 6
 *               name:
 *                 type: string
 *     responses:
 *       201:
 *         description: User created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *                 accessToken:
 *                   type: string
 *                 refreshToken:
 *                   type: string
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       409:
 *         description: Email already exists
 */
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

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    const passwordHash = await hashPassword(password);

    // Atomically create user and refresh token so neither exists without the other
    const { user, accessToken, refreshToken } = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, name, passwordHash },
        select: { id: true, email: true, name: true, role: true, createdAt: true },
      });
      const accessToken = generateAccessToken({ id: user.id });
      const refreshToken = generateRefreshToken();
      await tx.refreshToken.create({
        data: { token: refreshToken, userId: user.id, expiresAt: getRefreshTokenExpiry() },
      });
      return { user, accessToken, refreshToken };
    });

    logger.info('User signup successful', { userId: user.id, email: user.email });
    res.status(201).json({ user, accessToken, refreshToken });
  } catch (error) {
    logger.error('Signup failed', { error: error.message, ip: req.ip });
    res.status(500).json({ error: 'Failed to signup' });
  }
});

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Log in with email and password
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *                 accessToken:
 *                   type: string
 *                 refreshToken:
 *                   type: string
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         description: Invalid credentials or inactive account
 */
router.post('/login', async (req, res) => {
  try {
    // Validate request body before logging to avoid capturing unvalidated input
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
    logger.info('User login attempt', { ip: req.ip, email, userAgent: req.get('User-Agent') });
    
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

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Rotate refresh token and get a new access token
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: New tokens issued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                 refreshToken:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       500:
 *         description: Invalid or expired refresh token
 */
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

    const result = await prisma.$transaction(async (tx) => {
      const storedToken = await tx.refreshToken.findUnique({
        where: { token: refreshToken },
        include: { user: true },
      });

      if (!storedToken) {
        throw new Error('Invalid refresh token');
      }

      if (storedToken.expiresAt < new Date()) {
        await tx.refreshToken.delete({ where: { id: storedToken.id } });
        throw new Error('Refresh token expired');
      }

      if (!storedToken.user.isActive) {
        await tx.refreshToken.delete({ where: { id: storedToken.id } });
        throw new Error('Account is inactive');
      }

      const accessToken = generateAccessToken({
        id: storedToken.user.id,
        email: storedToken.user.email,
        role: storedToken.user.role,
      });
      const newRefreshToken = generateRefreshToken();
      const expiresAt = getRefreshTokenExpiry();

      await tx.refreshToken.delete({ where: { id: storedToken.id } });
      await tx.refreshToken.create({
        data: { token: newRefreshToken, userId: storedToken.userId, expiresAt },
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

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Invalidate all refresh tokens for the current user
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Logged out successfully
 *       401:
 *         description: Unauthorized
 */
router.post('/logout', authenticate, async (req, res) => {
  try {
    const { id: userId } = req.user;

    logger.info('User logout attempt', { userId, ip: req.ip });

    await prisma.refreshToken.deleteMany({ where: { userId } });

    logger.info('User logout successful', { userId, ip: req.ip });
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    logger.error('Logout failed', { error: error.message, userId: req.user?.id, ip: req.ip });
    res.status(500).json({ error: 'Failed to logout' });
  }
});

export default router;
