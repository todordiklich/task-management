import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// Mock all dependencies
jest.mock('../../src/config/prisma.js', () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    userOrganization: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('../../src/utils/logger.js', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('../../src/utils/password.js', () => ({
  __esModule: true,
  hashPassword: jest.fn(),
}));

import prisma from '../../src/config/prisma.js';
import { hashPassword } from '../../src/utils/password.js';

// Mock authenticate — if req.user already set (e.g. by admin test middleware), don't override
jest.mock('../../src/middleware/auth.js', () => ({
  authenticate: (req, res, next) => {
    if (!req.user) {
      req.user = { id: 1, email: 'test@example.com', role: 'user' };
    }
    next();
  },
}));

// Import the user routes
import userRoutes from '../../src/routes/users.js';

describe('User Endpoints', () => {
  let app;

  beforeEach(() => {
    jest.resetAllMocks();

    // Setup default mocks
    hashPassword.mockResolvedValue('hashed_password_123');

    // Create test app
    app = express();
    app.use(express.json());
    app.use('/api/v1/users', userRoutes);
  });

  describe('GET /api/v1/users/:id', () => {
    it('should get user details for authenticated user', async () => {
      const targetId = 1;
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        role: 'user',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        organizations: [
          {
            organization: { id: 1, name: 'Test Org' },
            role: { name: 'member' },
          },
        ],
      };

      prisma.user.findUnique.mockResolvedValue(mockUser);

      const response = await request(app).get(`/api/v1/users/${targetId}`);

      expect(response.status).toBe(200);
      expect(response.body.email).toBe('test@example.com');
      expect(response.body.name).toBe('Test User');
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: targetId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });

    it('should get user details for admin accessing other user', async () => {
      // Mock admin user
      const appWithAdmin = express();
      appWithAdmin.use(express.json());

      appWithAdmin.use(
        '/api/v1/users',
        (req, res, next) => {
          req.user = {
            id: 1,
            email: 'admin@example.com',
            role: 'admin',
          };
          next();
        },
        userRoutes,
      );

      const targetId = 2;
      const mockUser = {
        id: 2,
        email: 'other@example.com',
        name: 'Other User',
        role: 'user',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        organizations: [],
      };

      prisma.user.findUnique.mockResolvedValue(mockUser);

      const response = await request(appWithAdmin).get(
        `/api/v1/users/${targetId}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.email).toBe('other@example.com');
    });

    it('should reject access when user tries to access other user profile', async () => {
      const targetId = 2; // Different from authenticated user (id: 1)

      const response = await request(app).get(`/api/v1/users/${targetId}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe(
        'Forbidden: Can only access own profile',
      );
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('should reject access with invalid user ID', async () => {
      const response = await request(app).get('/api/v1/users/invalid');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid user ID');
    });

    it('should handle user not found', async () => {
      const targetId = 1;
      prisma.user.findUnique.mockResolvedValue(null);

      const response = await request(app).get(`/api/v1/users/${targetId}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('User not found');
    });

    it('should handle database errors', async () => {
      const targetId = 1;
      prisma.user.findUnique.mockRejectedValue(new Error('Database error'));

      const response = await request(app).get(`/api/v1/users/${targetId}`);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to get user');
    });
  });

  describe('PATCH /api/v1/users/:id', () => {
    it('should update user profile successfully', async () => {
      const targetId = 1;
      const updateData = {
        name: 'Updated Name',
      };

      const mockUser = {
        id: 1,
        email: 'test@example.com',
        name: 'Updated Name',
        role: 'user',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue(mockUser);

      const response = await request(app)
        .patch(`/api/v1/users/${targetId}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Updated Name');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: targetId },
        data: updateData,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });

    it('should allow admin to update other user profile', async () => {
      // Mock admin user
      const appWithAdmin = express();
      appWithAdmin.use(express.json());

      appWithAdmin.use(
        '/api/v1/users',
        (req, res, next) => {
          req.user = {
            id: 1,
            email: 'admin@example.com',
            role: 'admin',
          };
          next();
        },
        userRoutes,
      );

      const targetId = 2;
      const updateData = {
        isActive: false,
      };

      const mockUser = {
        id: 2,
        email: 'other@example.com',
        name: 'Other User',
        role: 'user',
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue(mockUser);

      const response = await request(appWithAdmin)
        .patch(`/api/v1/users/${targetId}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.isActive).toBe(false);
    });

    it('should reject non-admin updating other user profile', async () => {
      const targetId = 2; // Different from authenticated user (id: 1)
      const updateData = {
        name: 'Updated Name',
      };

      const response = await request(app)
        .patch(`/api/v1/users/${targetId}`)
        .send(updateData);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe(
        'Forbidden: Can only update own profile',
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('should update user password', async () => {
      const targetId = 1;
      const updateData = {
        password: 'newpassword123',
      };

      const mockUser = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        role: 'user',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue(mockUser);

      const response = await request(app)
        .patch(`/api/v1/users/${targetId}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(hashPassword).toHaveBeenCalledWith('newpassword123');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: targetId },
        data: { passwordHash: 'hashed_password_123' },
        select: expect.any(Object),
      });
    });

    it('should reject duplicate email', async () => {
      const targetId = 1;
      const updateData = {
        email: 'existing@example.com',
      };

      const mockUser = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
      };

      const existingUser = {
        id: 2,
        email: 'existing@example.com',
        name: 'Existing User',
      };

      prisma.user.findUnique
        .mockResolvedValueOnce(mockUser) // First call for target user
        .mockResolvedValueOnce(existingUser); // Second call for email check

      const response = await request(app)
        .patch(`/api/v1/users/${targetId}`)
        .send(updateData);

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('Email already exists');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('should allow updating to same email', async () => {
      const targetId = 1;
      const updateData = {
        email: 'test@example.com', // Same as current email
      };

      const mockUser = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
      };

      const updatedUser = {
        ...mockUser,
        updatedAt: new Date(),
      };

      prisma.user.findUnique
        .mockResolvedValueOnce(mockUser) // First call for target user
        .mockResolvedValueOnce(mockUser); // Second call for email check (same user)

      prisma.user.update.mockResolvedValue(updatedUser);

      const response = await request(app)
        .patch(`/api/v1/users/${targetId}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: targetId },
        data: { email: 'test@example.com' },
        select: expect.any(Object),
      });
    });

    it('should reject non-admin updating role', async () => {
      const targetId = 1;
      const updateData = {
        role: 'admin',
      };

      const mockUser = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
      };

      prisma.user.findUnique.mockResolvedValue(mockUser);

      const response = await request(app)
        .patch(`/api/v1/users/${targetId}`)
        .send(updateData);

      expect(response.status).toBe(200);
      // Non-admin should not be able to update role
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: targetId },
        data: {}, // Empty data because role is filtered out
        select: expect.any(Object),
      });
    });

    it('should allow admin to update role', async () => {
      // Mock admin user
      const appWithAdmin = express();
      appWithAdmin.use(express.json());

      appWithAdmin.use(
        '/api/v1/users',
        (req, res, next) => {
          req.user = {
            id: 1,
            email: 'admin@example.com',
            role: 'admin',
          };
          next();
        },
        userRoutes,
      );

      const targetId = 2;
      const updateData = {
        role: 'admin',
      };

      const mockUser = {
        id: 2,
        email: 'other@example.com',
        name: 'Other User',
        role: 'user',
      };

      const updatedUser = {
        ...mockUser,
        role: 'admin',
        updatedAt: new Date(),
      };

      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue(updatedUser);

      const response = await request(appWithAdmin)
        .patch(`/api/v1/users/${targetId}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.role).toBe('admin');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: targetId },
        data: { role: 'admin' },
        select: expect.any(Object),
      });
    });

    it('should allow admin to update isActive', async () => {
      // Mock admin user
      const appWithAdmin = express();
      appWithAdmin.use(express.json());

      appWithAdmin.use(
        '/api/v1/users',
        (req, res, next) => {
          req.user = {
            id: 1,
            email: 'admin@example.com',
            role: 'admin',
          };
          next();
        },
        userRoutes,
      );

      const targetId = 2;
      const updateData = {
        isActive: false,
      };

      const mockUser = {
        id: 2,
        email: 'other@example.com',
        name: 'Other User',
        isActive: true,
      };

      const updatedUser = {
        ...mockUser,
        isActive: false,
        updatedAt: new Date(),
      };

      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue(updatedUser);

      const response = await request(appWithAdmin)
        .patch(`/api/v1/users/${targetId}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.isActive).toBe(false);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: targetId },
        data: { isActive: false },
        select: expect.any(Object),
      });
    });

    it('should reject non-admin updating isActive', async () => {
      const targetId = 1;
      const updateData = {
        isActive: false,
      };

      const mockUser = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
      };

      prisma.user.findUnique.mockResolvedValue(mockUser);

      const response = await request(app)
        .patch(`/api/v1/users/${targetId}`)
        .send(updateData);

      expect(response.status).toBe(200);
      // Non-admin should not be able to update isActive
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: targetId },
        data: {}, // Empty data because isActive is filtered out
        select: expect.any(Object),
      });
    });

    it('should reject invalid email format', async () => {
      const targetId = 1;
      const updateData = {
        email: 'invalid-email',
      };

      const response = await request(app)
        .patch(`/api/v1/users/${targetId}`)
        .send(updateData);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request data');
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('should reject invalid role', async () => {
      // Mock admin user
      const appWithAdmin = express();
      appWithAdmin.use(express.json());

      appWithAdmin.use(
        '/api/v1/users',
        (req, res, next) => {
          req.user = {
            id: 1,
            email: 'admin@example.com',
            role: 'admin',
          };
          next();
        },
        userRoutes,
      );

      const targetId = 2;
      const updateData = {
        role: 'invalid_role',
      };

      const response = await request(appWithAdmin)
        .patch(`/api/v1/users/${targetId}`)
        .send(updateData);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request data');
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('should reject short password', async () => {
      const targetId = 1;
      const updateData = {
        password: '123',
      };

      const response = await request(app)
        .patch(`/api/v1/users/${targetId}`)
        .send(updateData);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request data');
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('should reject invalid user ID', async () => {
      const updateData = {
        name: 'Updated Name',
      };

      const response = await request(app)
        .patch('/api/v1/users/invalid')
        .send(updateData);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid user ID');
    });

    it('should handle user not found', async () => {
      const targetId = 1;
      const updateData = {
        name: 'Updated Name',
      };

      prisma.user.findUnique.mockResolvedValue(null);

      const response = await request(app)
        .patch(`/api/v1/users/${targetId}`)
        .send(updateData);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('User not found');
    });

    it('should handle database errors', async () => {
      const targetId = 1;
      const updateData = {
        name: 'Updated Name',
      };

      prisma.user.findUnique.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .patch(`/api/v1/users/${targetId}`)
        .send(updateData);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to update user');
    });

    it('should handle empty update data', async () => {
      const targetId = 1;
      const updateData = {};

      const response = await request(app)
        .patch(`/api/v1/users/${targetId}`)
        .send(updateData);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request data');
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('Input Validation', () => {
    it('should validate email format in update', async () => {
      const invalidEmails = [
        'invalid',
        'test@',
        '@example.com',
        'test.example.com',
        'test@.com',
      ];

      for (const email of invalidEmails) {
        const response = await request(app)
          .patch('/api/v1/users/1')
          .send({ email });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid request data');
      }
    });

    it('should validate name length', async () => {
      const response = await request(app)
        .patch('/api/v1/users/1')
        .send({ name: 'a' }); // Too short

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request data');
    });

    it('should validate password length', async () => {
      const response = await request(app)
        .patch('/api/v1/users/1')
        .send({ password: '123' }); // Too short

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request data');
    });

    it('should validate role enum values', async () => {
      // Mock admin user
      const appWithAdmin = express();
      appWithAdmin.use(express.json());

      appWithAdmin.use(
        '/api/v1/users',
        (req, res, next) => {
          req.user = {
            id: 1,
            email: 'admin@example.com',
            role: 'admin',
          };
          next();
        },
        userRoutes,
      );

      const response = await request(appWithAdmin)
        .patch('/api/v1/users/2')
        .send({ role: 'invalid_role' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request data');
    });
  });

  describe('Security', () => {
    it('should prevent users from updating their own role to admin', async () => {
      const targetId = 1;
      const updateData = {
        role: 'admin',
      };

      const mockUser = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
      };

      prisma.user.findUnique.mockResolvedValue(mockUser);

      const response = await request(app)
        .patch(`/api/v1/users/${targetId}`)
        .send(updateData);

      expect(response.status).toBe(200);
      // Role should not be updated for non-admin
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: targetId },
        data: {}, // Empty because role is filtered out
        select: expect.any(Object),
      });
    });

    it('should prevent users from updating their own active status', async () => {
      const targetId = 1;
      const updateData = {
        isActive: false,
      };

      const mockUser = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
      };

      prisma.user.findUnique.mockResolvedValue(mockUser);

      const response = await request(app)
        .patch(`/api/v1/users/${targetId}`)
        .send(updateData);

      expect(response.status).toBe(200);
      // isActive should not be updated for non-admin
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: targetId },
        data: {}, // Empty because isActive is filtered out
        select: expect.any(Object),
      });
    });

    it('should hash passwords before storing', async () => {
      const targetId = 1;
      const updateData = {
        password: 'newpassword123',
      };

      const mockUser = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
      };

      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue(mockUser);

      await request(app).patch(`/api/v1/users/${targetId}`).send(updateData);

      expect(hashPassword).toHaveBeenCalledWith('newpassword123');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: targetId },
        data: { passwordHash: 'hashed_password_123' },
        select: expect.any(Object),
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .patch('/api/v1/users/1')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}');

      expect(response.status).toBe(400);
    });

    it('should handle large payloads', async () => {
      const largeData = {
        name: 'a'.repeat(10000),
      };

      const response = await request(app)
        .patch('/api/v1/users/1')
        .send(largeData);

      expect(response.status).toBe(400);
    });
  });
});
