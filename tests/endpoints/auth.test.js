import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// Mock all dependencies
jest.mock('../../src/config/prisma.js', () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock('../../src/utils/logger.js', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    security: jest.fn(),
  },
}));

jest.mock('../../src/utils/password.js', () => ({
  __esModule: true,
  hashPassword: jest.fn(),
  comparePassword: jest.fn(),
}));

jest.mock('../../src/utils/tokens.js', () => ({
  __esModule: true,
  generateAccessToken: jest.fn(),
  generateRefreshToken: jest.fn(),
  getRefreshTokenExpiry: jest.fn(),
}));

// Mock rate limiting
jest.mock('../../src/middleware/rateLimit.js', () => ({
  authRateLimit: (req, res, next) => next(),
}));

// Mock authenticate — respects req.user if already set by test middleware
jest.mock('../../src/middleware/auth.js', () => ({
  authenticate: (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Access token required' });
    }
    next();
  },
}));

import prisma from '../../src/config/prisma.js';
import { hashPassword, comparePassword } from '../../src/utils/password.js';
import {
  generateAccessToken,
  generateRefreshToken,
  getRefreshTokenExpiry,
} from '../../src/utils/tokens.js';

// Import the auth routes
import authRoutes from '../../src/routes/auth.js';

describe('Auth Endpoints', () => {
  let app;

  beforeEach(() => {
    jest.resetAllMocks();

    // Setup default mocks
    hashPassword.mockResolvedValue('hashed_password_123');
    comparePassword.mockResolvedValue(true);
    generateAccessToken.mockReturnValue('mock_access_token');
    generateRefreshToken.mockReturnValue('mock_refresh_token');
    getRefreshTokenExpiry.mockReturnValue(
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    );
    prisma.$transaction.mockImplementation(async (cb) => cb(prisma));

    // Create test app
    app = express();
    app.use(express.json());
    app.use('/api/v1/auth', authRoutes);
  });

  describe('POST /api/v1/auth/signup', () => {
    it('should create a new user successfully', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
      };

      const mockUser = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        role: 'user',
        isActive: true,
        createdAt: new Date(),
      };

      prisma.user.findUnique.mockResolvedValue(null); // No existing user
      prisma.user.create.mockResolvedValue(mockUser);

      const response = await request(app)
        .post('/api/v1/auth/signup')
        .send(userData);

      expect(response.status).toBe(201);
      expect(response.body.user).toMatchObject({
        id: mockUser.id,
        email: mockUser.email,
        name: mockUser.name,
        role: mockUser.role,
      });
      expect(response.body.accessToken).toBe('mock_access_token');
      expect(response.body.refreshToken).toBe('mock_refresh_token');
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: userData.email,
          name: userData.name,
          passwordHash: 'hashed_password_123',
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
        },
      });
    });

    it('should reject signup with existing email', async () => {
      const userData = {
        email: 'existing@example.com',
        password: 'password123',
        name: 'Test User',
      };

      const existingUser = {
        id: 1,
        email: 'existing@example.com',
        name: 'Existing User',
      };

      prisma.user.findUnique.mockResolvedValue(existingUser);

      const response = await request(app)
        .post('/api/v1/auth/signup')
        .send(userData);

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('Email already exists');
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('should reject signup with invalid email', async () => {
      const userData = {
        email: 'invalid-email',
        password: 'password123',
        name: 'Test User',
      };

      const response = await request(app)
        .post('/api/v1/auth/signup')
        .send(userData);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request data');
      expect(response.body.details).toBeDefined();
    });

    it('should reject signup with short password', async () => {
      const userData = {
        email: 'test@example.com',
        password: '123',
        name: 'Test User',
      };

      const response = await request(app)
        .post('/api/v1/auth/signup')
        .send(userData);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request data');
    });

    it('should reject signup with missing required fields', async () => {
      const response = await request(app).post('/api/v1/auth/signup').send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request data');
    });

    it('should handle database errors gracefully', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
      };

      prisma.user.findUnique.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/api/v1/auth/signup')
        .send(userData);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to signup');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should login user with valid credentials', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'password123',
      };

      const mockUser = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        role: 'user',
        isActive: true,
        passwordHash: 'hashed_password_123',
      };

      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
      prisma.refreshToken.create.mockResolvedValue({
        id: 1,
        token: 'mock_refresh_token',
        userId: 1,
        expiresAt: getRefreshTokenExpiry(),
      });

      prisma.$transaction.mockImplementation(async (callback) => {
        return await callback(prisma);
      });

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(loginData);

      expect(response.status).toBe(200);
      expect(response.body.user.email).toBe('test@example.com');
      expect(response.body.accessToken).toBe('mock_access_token');
      expect(response.body.refreshToken).toBe('mock_refresh_token');
    });

    it('should reject login with non-existent user', async () => {
      const loginData = {
        email: 'nonexistent@example.com',
        password: 'password123',
      };

      prisma.user.findUnique.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(loginData);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid credentials');
    });

    it('should reject login with wrong password', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'wrongpassword',
      };

      const mockUser = {
        id: 1,
        email: 'test@example.com',
        passwordHash: 'hashed_password_123',
        isActive: true,
      };

      prisma.user.findUnique.mockResolvedValue(mockUser);
      comparePassword.mockResolvedValue(false);

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(loginData);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid credentials');
    });

    it('should reject login with inactive account', async () => {
      const loginData = {
        email: 'inactive@example.com',
        password: 'password123',
      };

      const mockUser = {
        id: 1,
        email: 'inactive@example.com',
        passwordHash: 'hashed_password_123',
        isActive: false,
      };

      prisma.user.findUnique.mockResolvedValue(mockUser);

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(loginData);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Account is inactive');
    });

    it('should reject login with invalid email format', async () => {
      const loginData = {
        email: 'invalid-email',
        password: 'password123',
      };

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(loginData);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request data');
    });

    it('should reject login with missing password', async () => {
      const loginData = {
        email: 'test@example.com',
      };

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(loginData);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request data');
    });

    it('should handle database errors during login', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'password123',
      };

      prisma.user.findUnique.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(loginData);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to login');
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('should refresh access token with valid refresh token', async () => {
      const refreshData = {
        refreshToken: 'valid_refresh_token',
      };

      const mockStoredToken = {
        id: 1,
        token: 'valid_refresh_token',
        userId: 1,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
        user: {
          id: 1,
          email: 'test@example.com',
          isActive: true,
          role: 'user',
        },
      };

      prisma.refreshToken.findUnique.mockResolvedValue(mockStoredToken);
      prisma.refreshToken.delete.mockResolvedValue({ id: 1 });
      prisma.refreshToken.create.mockResolvedValue({
        id: 2,
        token: 'new_refresh_token',
        userId: 1,
        expiresAt: getRefreshTokenExpiry(),
      });

      prisma.$transaction.mockImplementation(async (callback) => {
        return await callback(prisma);
      });

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send(refreshData);

      expect(response.status).toBe(200);
      expect(response.body.accessToken).toBe('mock_access_token');
      expect(response.body.refreshToken).toBe('mock_refresh_token');
      expect(response.body.user.email).toBe('test@example.com');
    });

    it('should reject refresh with invalid token', async () => {
      const refreshData = {
        refreshToken: 'invalid_token',
      };

      prisma.refreshToken.findUnique.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send(refreshData);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to refresh token');
    });

    it('should reject refresh with expired token', async () => {
      const refreshData = {
        refreshToken: 'expired_token',
      };

      const mockExpiredToken = {
        id: 1,
        token: 'expired_token',
        userId: 1,
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
        user: {
          id: 1,
          email: 'test@example.com',
          isActive: true,
          role: 'user',
        },
      };

      prisma.refreshToken.findUnique.mockResolvedValue(mockExpiredToken);

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send(refreshData);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to refresh token');
    });

    it('should reject refresh with inactive user', async () => {
      const refreshData = {
        refreshToken: 'valid_token',
      };

      const mockToken = {
        id: 1,
        token: 'valid_token',
        userId: 1,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        user: {
          id: 1,
          email: 'test@example.com',
          isActive: false, // Inactive user
          role: 'user',
        },
      };

      prisma.refreshToken.findUnique.mockResolvedValue(mockToken);

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send(refreshData);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to refresh token');
    });

    it('should reject refresh with missing token', async () => {
      const response = await request(app).post('/api/v1/auth/refresh').send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request data');
    });

    it('should reject refresh with empty token', async () => {
      const refreshData = {
        refreshToken: '',
      };

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send(refreshData);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request data');
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should logout user successfully', async () => {
      // Mock authenticated user
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        role: 'user',
      };

      // Mock authenticate middleware
      const mockAuthenticate = (req, res, next) => {
        req.user = mockUser;
        next();
      };

      // Create app with auth middleware
      const appWithAuth = express();
      appWithAuth.use(express.json());

      // Mock authenticate middleware
      appWithAuth.use('/api/v1/auth/logout', (req, res, next) => {
        req.user = mockUser;
        next();
      });

      appWithAuth.use('/api/v1/auth', authRoutes);

      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 2 });

      const response = await request(appWithAuth)
        .post('/api/v1/auth/logout')
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Logged out successfully');
      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 1 },
      });
    });

    it('should handle logout without authentication', async () => {
      const response = await request(app).post('/api/v1/auth/logout').send({});

      expect(response.status).toBe(401);
    });

    it('should handle database errors during logout', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        role: 'user',
      };

      // Mock authenticate middleware
      const appWithAuth = express();
      appWithAuth.use(express.json());

      appWithAuth.use('/api/v1/auth/logout', (req, res, next) => {
        req.user = mockUser;
        next();
      });

      appWithAuth.use('/api/v1/auth', authRoutes);

      prisma.refreshToken.deleteMany.mockRejectedValue(
        new Error('Database error'),
      );

      const response = await request(appWithAuth)
        .post('/api/v1/auth/logout')
        .send({});

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to logout');
    });
  });

  describe('Authentication Security', () => {
    it('should use secure password hashing', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
      };

      const mockUser = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        role: 'user',
        isActive: true,
        createdAt: new Date(),
      };

      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(mockUser);

      await request(app).post('/api/v1/auth/signup').send(userData);

      expect(hashPassword).toHaveBeenCalledWith('password123');
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: userData.email,
          name: userData.name,
          passwordHash: 'hashed_password_123',
        },
        select: expect.any(Object),
      });
    });

    it('should rotate refresh tokens on login', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'password123',
      };

      const mockUser = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        role: 'user',
        isActive: true,
        passwordHash: 'hashed_password_123',
      };

      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
      prisma.refreshToken.create.mockResolvedValue({
        id: 1,
        token: 'mock_refresh_token',
        userId: 1,
        expiresAt: getRefreshTokenExpiry(),
      });

      prisma.$transaction.mockImplementation(async (callback) => {
        return await callback(prisma);
      });

      await request(app).post('/api/v1/auth/login').send(loginData);

      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 1 },
      });
      expect(prisma.refreshToken.create).toHaveBeenCalledWith({
        data: {
          token: 'mock_refresh_token',
          userId: 1,
          expiresAt: expect.any(Date),
        },
      });
    });

    it('should use atomic transactions for login', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'password123',
      };

      const mockUser = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        role: 'user',
        isActive: true,
        passwordHash: 'hashed_password_123',
      };

      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
      prisma.refreshToken.create.mockResolvedValue({
        id: 1,
        token: 'mock_refresh_token',
        userId: 1,
        expiresAt: getRefreshTokenExpiry(),
      });

      prisma.$transaction.mockImplementation(async (callback) => {
        return await callback(prisma);
      });

      await request(app).post('/api/v1/auth/login').send(loginData);

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should use atomic transactions for refresh', async () => {
      const refreshData = {
        refreshToken: 'valid_refresh_token',
      };

      const mockStoredToken = {
        id: 1,
        token: 'valid_refresh_token',
        userId: 1,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        user: {
          id: 1,
          email: 'test@example.com',
          isActive: true,
          role: 'user',
        },
      };

      prisma.refreshToken.findUnique.mockResolvedValue(mockStoredToken);
      prisma.refreshToken.delete.mockResolvedValue({ id: 1 });
      prisma.refreshToken.create.mockResolvedValue({
        id: 2,
        token: 'new_refresh_token',
        userId: 1,
        expiresAt: getRefreshTokenExpiry(),
      });

      prisma.$transaction.mockImplementation(async (callback) => {
        return await callback(prisma);
      });

      await request(app).post('/api/v1/auth/refresh').send(refreshData);

      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('Input Validation', () => {
    it('should validate all required fields', async () => {
      const testCases = [
        { data: {}, expectedFields: ['email', 'password'] },
        { data: { email: 'test@example.com' }, expectedFields: ['password'] },
        { data: { password: 'password123' }, expectedFields: ['email'] },
      ];

      for (const testCase of testCases) {
        const response = await request(app)
          .post('/api/v1/auth/login')
          .send(testCase.data);

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid request data');
        expect(response.body.details).toBeInstanceOf(Array);
      }
    });

    it('should validate email format', async () => {
      const invalidEmails = [
        'invalid',
        'test@',
        '@example.com',
        'test.example.com',
        'test@.com',
      ];

      for (const email of invalidEmails) {
        const response = await request(app)
          .post('/api/v1/auth/login')
          .send({ email, password: 'password123' });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid request data');
      }
    });

    it('should validate password length', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'test@example.com', password: '123' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request data');
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}');

      expect(response.status).toBe(400);
    });

    it('should handle large payloads', async () => {
      const largeData = {
        email: 'test@example.com',
        password: 'a'.repeat(10000),
      };

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(largeData);

      expect(response.status).toBe(400);
    });
  });
});
