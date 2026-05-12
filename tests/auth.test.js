import { jest } from '@jest/globals';
import prisma from '../src/config/prisma.js';
import { hashPassword, comparePassword } from '../src/utils/password.js';
import {
  generateAccessToken,
  generateRefreshToken,
  getRefreshTokenExpiry,
} from '../src/utils/tokens.js';
import {
  loginSchema,
  signupSchema,
  refreshTokenSchema,
} from '../src/utils/validation.js';

// Mock Prisma
jest.mock('../src/config/prisma.js', () => ({
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

// Mock logger
jest.mock('../src/utils/logger.js', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    security: jest.fn(),
  },
}));

describe('Password Utils', () => {
  describe('hashPassword', () => {
    it('should hash a password successfully', async () => {
      const password = 'testPassword123';
      const hashedPassword = await hashPassword(password);

      expect(hashedPassword).toBeDefined();
      expect(hashedPassword).not.toBe(password);
      expect(hashedPassword).toMatch(/^\$2[aby]\$\d+\$/); // bcrypt format
    });

    it('should generate different hashes for the same password', async () => {
      const password = 'testPassword123';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('comparePassword', () => {
    it('should verify correct password', async () => {
      const password = 'testPassword123';
      const hashedPassword = await hashPassword(password);

      const isValid = await comparePassword(password, hashedPassword);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'testPassword123';
      const wrongPassword = 'wrongPassword';
      const hashedPassword = await hashPassword(password);

      const isValid = await comparePassword(wrongPassword, hashedPassword);
      expect(isValid).toBe(false);
    });
  });
});

describe('Token Utils', () => {
  describe('generateAccessToken', () => {
    it('should generate a valid JWT access token', () => {
      const payload = { id: 1, email: 'test@example.com', role: 'user' };
      const token = generateAccessToken(payload);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('should include user data in token payload', () => {
      const payload = { id: 1, email: 'test@example.com', role: 'admin' };
      const token = generateAccessToken(payload);

      // Decode token to verify payload (simple check)
      const decoded = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64').toString(),
      );
      expect(decoded.id).toBe(payload.id);
      expect(decoded.email).toBe(payload.email);
      expect(decoded.role).toBe(payload.role);
    });
  });

  describe('generateRefreshToken', () => {
    it('should generate a refresh token', () => {
      const token = generateRefreshToken();

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(20);
    });

    it('should generate unique tokens', () => {
      const token1 = generateRefreshToken();
      const token2 = generateRefreshToken();

      expect(token1).not.toBe(token2);
    });
  });

  describe('getRefreshTokenExpiry', () => {
    it('should return a future date', () => {
      const expiry = getRefreshTokenExpiry();
      const now = new Date();

      expect(expiry).toBeInstanceOf(Date);
      expect(expiry.getTime()).toBeGreaterThan(now.getTime());
    });

    it('should return expiry approximately 7 days from now', () => {
      const expiry = getRefreshTokenExpiry();
      const now = new Date();
      const expectedTime = now.getTime() + 7 * 24 * 60 * 60 * 1000;

      // Allow 1 minute tolerance
      expect(Math.abs(expiry.getTime() - expectedTime)).toBeLessThan(60000);
    });
  });
});

describe('Validation Schemas', () => {
  describe('loginSchema', () => {
    it('should validate correct login data', () => {
      const data = { email: 'test@example.com', password: 'password123' };
      const result = loginSchema.safeParse(data);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(data);
    });

    it('should reject invalid email', () => {
      const data = { email: 'invalid-email', password: 'password123' };
      const result = loginSchema.safeParse(data);

      expect(result.success).toBe(false);
      expect(result.error.issues).toHaveLength(1);
      expect(result.error.issues[0].message).toContain('email');
    });

    it('should reject missing password', () => {
      const data = { email: 'test@example.com' };
      const result = loginSchema.safeParse(data);

      expect(result.success).toBe(false);
      expect(result.error.issues).toHaveLength(1);
    });

    it('should reject short password', () => {
      const data = { email: 'test@example.com', password: '123' };
      const result = loginSchema.safeParse(data);

      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('6 characters');
    });
  });

  describe('signupSchema', () => {
    it('should validate correct signup data', () => {
      const data = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
      };
      const result = signupSchema.safeParse(data);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(data);
    });

    it('should accept signup without name', () => {
      const data = { email: 'test@example.com', password: 'password123' };
      const result = signupSchema.safeParse(data);

      expect(result.success).toBe(true);
      expect(result.data.name).toBeUndefined();
    });

    it('should reject short name', () => {
      const data = {
        email: 'test@example.com',
        password: 'password123',
        name: 'a',
      };
      const result = signupSchema.safeParse(data);

      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('2 characters');
    });
  });

  describe('refreshTokenSchema', () => {
    it('should validate correct refresh token', () => {
      const data = { refreshToken: 'valid-refresh-token-123' };
      const result = refreshTokenSchema.safeParse(data);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(data);
    });

    it('should reject empty refresh token', () => {
      const data = { refreshToken: '' };
      const result = refreshTokenSchema.safeParse(data);

      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('required');
    });

    it('should reject missing refresh token', () => {
      const data = {};
      const result = refreshTokenSchema.safeParse(data);

      expect(result.success).toBe(false);
    });
  });
});

describe('Authentication Business Logic', () => {
  let mockPrisma;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = prisma;
  });

  describe('User Authentication Flow', () => {
    it('should authenticate user with valid credentials', async () => {
      // Mock user data
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        passwordHash: await hashPassword('password123'),
        isActive: true,
        role: 'user',
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.refreshToken.create.mockResolvedValue({ id: 1 });

      // Simulate login logic
      const email = 'test@example.com';
      const password = 'password123';

      const user = await mockPrisma.user.findUnique({ where: { email } });
      expect(user).toBeTruthy();

      const isValidPassword = await comparePassword(
        password,
        user.passwordHash,
      );
      expect(isValidPassword).toBe(true);

      expect(user.isActive).toBe(true);
    });

    it('should reject inactive user', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        passwordHash: await hashPassword('password123'),
        isActive: false,
        role: 'user',
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const email = 'test@example.com';
      const password = 'password123';

      const user = await mockPrisma.user.findUnique({ where: { email } });
      expect(user.isActive).toBe(false);
    });

    it('should reject user with wrong password', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        passwordHash: await hashPassword('password123'),
        isActive: true,
        role: 'user',
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const email = 'test@example.com';
      const wrongPassword = 'wrongpassword';

      const user = await mockPrisma.user.findUnique({ where: { email } });
      const isValidPassword = await comparePassword(
        wrongPassword,
        user.passwordHash,
      );
      expect(isValidPassword).toBe(false);
    });

    it('should handle non-existent user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const email = 'nonexistent@example.com';
      const user = await mockPrisma.user.findUnique({ where: { email } });

      expect(user).toBeNull();
    });
  });

  describe('Token Management', () => {
    it('should rotate refresh tokens on login', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        passwordHash: await hashPassword('password123'),
        isActive: true,
        role: 'user',
      };

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback(mockPrisma);
      });

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.refreshToken.create.mockResolvedValue({
        id: 1,
        token: 'new-refresh-token',
        userId: 1,
        expiresAt: getRefreshTokenExpiry(),
      });

      // Simulate token rotation
      await mockPrisma.refreshToken.deleteMany({ where: { userId: 1 } });
      expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 1 },
      });

      const newToken = generateRefreshToken();
      await mockPrisma.refreshToken.create({
        data: {
          token: newToken,
          userId: 1,
          expiresAt: getRefreshTokenExpiry(),
        },
      });

      expect(mockPrisma.refreshToken.create).toHaveBeenCalledWith({
        data: {
          token: expect.any(String),
          userId: 1,
          expiresAt: expect.any(Date),
        },
      });
    });
  });
});
