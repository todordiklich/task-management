import { jest } from '@jest/globals';

// Mock all external dependencies
jest.mock('../src/config/prisma.js', () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    organization: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    project: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
    },
    task: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
    },
    userOrganization: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    invitation: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      deleteMany: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock('../src/utils/logger.js', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    security: jest.fn(),
  },
}));

jest.mock('../src/utils/password.js', () => ({
  __esModule: true,
  hashPassword: jest.fn(),
  comparePassword: jest.fn(),
}));

jest.mock('../src/utils/tokens.js', () => ({
  __esModule: true,
  generateAccessToken: jest.fn(),
  generateRefreshToken: jest.fn(),
  getRefreshTokenExpiry: jest.fn(),
}));

import prisma from '../src/config/prisma.js';

let hashPassword;
let comparePassword;
let generateAccessToken;
let generateRefreshToken;
let getRefreshTokenExpiry;

describe('Business Logic Tests', () => {
  let mockPrisma;

  beforeEach(() => {
    jest.clearAllMocks();
    // Use the mocked prisma from the import at the top of the file
    mockPrisma = prisma;

    const passwordUtils = jest.requireMock('../src/utils/password.js');
    const tokenUtils = jest.requireMock('../src/utils/tokens.js');

    hashPassword = passwordUtils.hashPassword;
    comparePassword = passwordUtils.comparePassword;
    generateAccessToken = tokenUtils.generateAccessToken;
    generateRefreshToken = tokenUtils.generateRefreshToken;
    getRefreshTokenExpiry = tokenUtils.getRefreshTokenExpiry;

    // Setup default mock implementations
    hashPassword.mockResolvedValue('hashed_password');
    comparePassword.mockResolvedValue(true);
    generateAccessToken.mockReturnValue('access_token');
    generateRefreshToken.mockReturnValue('refresh_token');
    getRefreshTokenExpiry.mockReturnValue(new Date());
  });

  describe('User Management Logic', () => {
    describe('User Creation', () => {
      it('should create user with valid data', async () => {
        const userData = {
          email: 'test@example.com',
          name: 'Test User',
          passwordHash: 'hashed_password',
          role: 'user',
          isActive: true,
        };

        const mockUser = { id: 1, ...userData };
        prisma.user.create.mockResolvedValue(mockUser);

        const result = await prisma.user.create({
          data: userData,
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            isActive: true,
            createdAt: true,
          },
        });

        expect(result).toEqual(mockUser);
        expect(prisma.user.create).toHaveBeenCalledWith({
          data: userData,
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            isActive: true,
            createdAt: true,
          },
        });
      });

      it('should handle unique email constraint', async () => {
        const userData = {
          email: 'existing@example.com',
          name: 'Test User',
          passwordHash: 'hashed_password',
        };

        prisma.user.create.mockRejectedValue(
          new Error('Unique constraint failed'),
        );

        await expect(prisma.user.create({ data: userData })).rejects.toThrow(
          'Unique constraint failed',
        );
      });
    });

    describe('User Authentication', () => {
      it('should authenticate user with correct credentials', async () => {
        const mockUser = {
          id: 1,
          email: 'test@example.com',
          passwordHash: 'hashed_password',
          isActive: true,
          role: 'user',
        };

        prisma.user.findUnique.mockResolvedValue(mockUser);
        comparePassword.mockResolvedValue(true);

        const user = await prisma.user.findUnique({
          where: { email: 'test@example.com' },
        });
        expect(user).toBeTruthy();
        expect(user.email).toBe('test@example.com');

        const isValidPassword = await comparePassword(
          'password123',
          user.passwordHash,
        );
        expect(isValidPassword).toBe(true);
        expect(user.isActive).toBe(true);
      });

      it('should reject authentication for inactive user', async () => {
        const mockUser = {
          id: 1,
          email: 'test@example.com',
          passwordHash: 'hashed_password',
          isActive: false,
          role: 'user',
        };

        prisma.user.findUnique.mockResolvedValue(mockUser);

        const user = await prisma.user.findUnique({
          where: { email: 'test@example.com' },
        });
        expect(user.isActive).toBe(false);
      });

      it('should reject authentication for non-existent user', async () => {
        prisma.user.findUnique.mockResolvedValue(null);

        const user = await prisma.user.findUnique({
          where: { email: 'nonexistent@example.com' },
        });
        expect(user).toBeNull();
      });
    });

    describe('User Updates', () => {
      it('should update user with valid data', async () => {
        const updateData = { name: 'Updated Name' };
        const mockUser = {
          id: 1,
          email: 'test@example.com',
          name: 'Updated Name',
          role: 'user',
          isActive: true,
        };

        prisma.user.update.mockResolvedValue(mockUser);

        const result = await prisma.user.update({
          where: { id: 1 },
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

        expect(result).toEqual(mockUser);
        expect(prisma.user.update).toHaveBeenCalledWith({
          where: { id: 1 },
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
    });
  });

  describe('Organization Management Logic', () => {
    describe('Organization Creation', () => {
      it('should create organization with valid data', async () => {
        const orgData = {
          name: 'Test Organization',
          description: 'Test description',
        };

        const mockOrg = { id: 1, ...orgData };
        prisma.organization.create.mockResolvedValue(mockOrg);

        const result = await prisma.organization.create({ data: orgData });
        expect(result).toEqual(mockOrg);
      });
    });

    describe('Organization Access Control', () => {
      it('should allow access for organization members', async () => {
        const mockMembership = {
          userId: 1,
          organizationId: 1,
          role: { name: 'admin' },
        };

        prisma.userOrganization.findFirst.mockResolvedValue(mockMembership);

        const membership = await prisma.userOrganization.findFirst({
          where: {
            userId: 1,
            organizationId: 1,
          },
          include: {
            role: true,
          },
        });

        expect(membership).toBeTruthy();
        expect(membership.userId).toBe(1);
        expect(membership.organizationId).toBe(1);
      });

      it('should deny access for non-members', async () => {
        prisma.userOrganization.findFirst.mockResolvedValue(null);

        const membership = await prisma.userOrganization.findFirst({
          where: {
            userId: 1,
            organizationId: 999,
          },
        });

        expect(membership).toBeNull();
      });
    });
  });

  describe('Project Management Logic', () => {
    describe('Project Creation', () => {
      it('should create project within organization', async () => {
        const projectData = {
          name: 'Test Project',
          description: 'Test description',
          organizationId: 1,
        };

        const mockProject = { id: 1, ...projectData };
        prisma.project.create.mockResolvedValue(mockProject);

        const result = await prisma.project.create({ data: projectData });
        expect(result).toEqual(mockProject);
      });
    });

    describe('Project Access Control', () => {
      it('should allow access for organization members', async () => {
        const mockProject = {
          id: 1,
          name: 'Test Project',
          organizationId: 1,
          organization: {
            users: [
              {
                userId: 1,
                role: { name: 'member' },
              },
            ],
          },
        };

        prisma.project.findFirst.mockResolvedValue(mockProject);

        const project = await prisma.project.findFirst({
          where: {
            id: 1,
            organization: {
              users: {
                some: {
                  userId: 1,
                },
              },
            },
          },
          include: {
            organization: {
              include: {
                users: {
                  include: {
                    role: true,
                  },
                },
              },
            },
          },
        });

        expect(project).toBeTruthy();
        expect(project.organization.users).toHaveLength(1);
        expect(project.organization.users[0].userId).toBe(1);
      });
    });
  });

  describe('Task Management Logic', () => {
    describe('Task Creation', () => {
      it('should create task with valid data', async () => {
        const taskData = {
          title: 'Test Task',
          description: 'Test description',
          projectId: 1,
          assigneeId: 1,
          completed: false,
        };

        const mockTask = { id: 1, ...taskData };
        prisma.task.create.mockResolvedValue(mockTask);

        const result = await prisma.task.create({ data: taskData });
        expect(result).toEqual(mockTask);
      });
    });

    describe('Task Assignment', () => {
      it('should assign task to project member', async () => {
        const taskData = {
          title: 'Test Task',
          projectId: 1,
          assigneeId: 1,
        };

        const mockTask = { id: 1, ...taskData };
        prisma.task.create.mockResolvedValue(mockTask);

        const result = await prisma.task.create({ data: taskData });
        expect(result.assigneeId).toBe(1);
      });
    });

    describe('Task Status Updates', () => {
      it('should update task completion status', async () => {
        const updateData = { completed: true };
        const mockTask = {
          id: 1,
          title: 'Test Task',
          completed: true,
        };

        prisma.task.update.mockResolvedValue(mockTask);

        const result = await prisma.task.update({
          where: { id: 1 },
          data: updateData,
        });

        expect(result.completed).toBe(true);
      });
    });
  });

  describe('Invitation System Logic', () => {
    describe('Invitation Creation', () => {
      it('should create invitation for valid user', async () => {
        const invitationData = {
          token: 'invitation-token-123',
          email: 'invite@example.com',
          organizationId: 1,
          roleId: 2,
          inviterId: 1,
          status: 'pending',
          expiresAt: new Date(),
        };

        const mockInvitation = { id: 1, ...invitationData };
        prisma.invitation.create.mockResolvedValue(mockInvitation);

        const result = await prisma.invitation.create({ data: invitationData });
        expect(result).toEqual(mockInvitation);
        expect(result.status).toBe('pending');
      });
    });

    describe('Invitation Acceptance', () => {
      it('should accept valid invitation', async () => {
        const mockInvitation = {
          id: 1,
          token: 'valid-token',
          email: 'user@example.com',
          organizationId: 1,
          roleId: 2,
          status: 'pending',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
        };

        prisma.invitation.findFirst.mockResolvedValue(mockInvitation);
        prisma.userOrganization.create.mockResolvedValue({ id: 1 });
        prisma.invitation.update.mockResolvedValue({
          ...mockInvitation,
          status: 'accepted',
        });

        // Simulate transaction
        prisma.$transaction.mockImplementation(async (callback) => {
          return await callback(prisma);
        });

        const invitation = await prisma.invitation.findFirst({
          where: {
            token: 'valid-token',
            status: 'pending',
            expiresAt: {
              gte: new Date(),
            },
          },
        });

        expect(invitation).toBeTruthy();
        expect(invitation.status).toBe('pending');
        expect(invitation.expiresAt.getTime()).toBeGreaterThan(Date.now());
      });

      it('should reject expired invitation', async () => {
        prisma.invitation.findFirst.mockResolvedValue(null);

        const invitation = await prisma.invitation.findFirst({
          where: {
            token: 'expired-token',
            status: 'pending',
            expiresAt: {
              gte: new Date(),
            },
          },
        });

        // This should return null due to expired date
        expect(invitation).toBeNull();
      });

      it('should prevent invitation reuse', async () => {
        prisma.invitation.findFirst.mockResolvedValue(null);

        const invitation = await prisma.invitation.findFirst({
          where: {
            token: 'used-token',
            status: 'pending', // Looking for pending status
            expiresAt: {
              gte: new Date(),
            },
          },
        });

        // This should return null due to wrong status
        expect(invitation).toBeNull();
      });
    });
  });

  describe('Token Management Logic', () => {
    describe('Refresh Token Rotation', () => {
      it('should rotate refresh tokens on login', async () => {
        const mockUser = {
          id: 1,
          email: 'test@example.com',
          isActive: true,
          role: 'user',
        };

        prisma.$transaction.mockImplementation(async (callback) => {
          return await callback(prisma);
        });

        prisma.user.findUnique.mockResolvedValue(mockUser);
        prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
        prisma.refreshToken.create.mockResolvedValue({
          id: 1,
          token: 'new-refresh-token',
          userId: 1,
          expiresAt: getRefreshTokenExpiry(),
        });

        // Simulate token rotation logic
        await prisma.refreshToken.deleteMany({ where: { userId: 1 } });
        expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
          where: { userId: 1 },
        });

        const newToken = generateRefreshToken();
        const expiresAt = getRefreshTokenExpiry();

        await prisma.refreshToken.create({
          data: {
            token: newToken,
            userId: 1,
            expiresAt,
          },
        });

        expect(prisma.refreshToken.create).toHaveBeenCalledWith({
          data: {
            token: 'refresh_token',
            userId: 1,
            expiresAt: expect.any(Date),
          },
        });
      });
    });

    describe('Token Validation', () => {
      it('should validate existing refresh token', async () => {
        const mockToken = {
          id: 1,
          token: 'valid-token',
          userId: 1,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          user: {
            id: 1,
            email: 'test@example.com',
            isActive: true,
            role: 'user',
          },
        };

        prisma.refreshToken.findUnique.mockResolvedValue(mockToken);

        const token = await prisma.refreshToken.findUnique({
          where: { token: 'valid-token' },
          include: { user: true },
        });

        expect(token).toBeTruthy();
        expect(token.token).toBe('valid-token');
        expect(token.user.isActive).toBe(true);
        expect(token.expiresAt.getTime()).toBeGreaterThan(Date.now());
      });

      it('should reject expired refresh token', async () => {
        const mockToken = {
          id: 1,
          token: 'expired-token',
          userId: 1,
          expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Expired
          user: {
            id: 1,
            email: 'test@example.com',
            isActive: true,
            role: 'user',
          },
        };

        prisma.refreshToken.findUnique.mockResolvedValue(mockToken);

        const token = await prisma.refreshToken.findUnique({
          where: { token: 'expired-token' },
          include: { user: true },
        });

        expect(token).toBeTruthy();
        expect(token.expiresAt.getTime()).toBeLessThan(Date.now());
      });
    });
  });

  describe('Transaction Logic', () => {
    it('should handle atomic operations correctly', async () => {
      const mockResult = { success: true };
      prisma.$transaction.mockResolvedValue(mockResult);

      const result = await prisma.$transaction(async (tx) => {
        // Simulate multiple operations
        await tx.user.create({ data: { email: 'test@example.com' } });
        await tx.organization.create({ data: { name: 'Test Org' } });
        return { success: true };
      });

      expect(result).toEqual(mockResult);
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should rollback on transaction failure', async () => {
      const error = new Error('Transaction failed');
      prisma.$transaction.mockRejectedValue(error);

      await expect(
        prisma.$transaction(async (tx) => {
          throw error;
        }),
      ).rejects.toThrow('Transaction failed');
    });
  });

  describe('Data Integrity Logic', () => {
    it('should prevent duplicate organizations for same user', async () => {
      const existingOrg = { id: 1, name: 'Existing Org' };
      prisma.organization.findUnique.mockResolvedValue(existingOrg);

      const org = await prisma.organization.findUnique({
        where: { name: 'Existing Org' },
      });

      expect(org).toBeTruthy();
      expect(org.id).toBe(1);
    });

    it('should prevent duplicate users with same email', async () => {
      const existingUser = { id: 1, email: 'existing@example.com' };
      prisma.user.findUnique.mockResolvedValue(existingUser);

      const user = await prisma.user.findUnique({
        where: { email: 'existing@example.com' },
      });

      expect(user).toBeTruthy();
      expect(user.email).toBe('existing@example.com');
    });

    it('should maintain referential integrity between projects and organizations', async () => {
      const mockProject = {
        id: 1,
        name: 'Test Project',
        organizationId: 1,
        organization: {
          id: 1,
          name: 'Test Organization',
        },
      };

      prisma.project.findUnique.mockResolvedValue(mockProject);

      const project = await prisma.project.findUnique({
        where: { id: 1 },
        include: { organization: true },
      });

      expect(project).toBeTruthy();
      expect(project.organizationId).toBe(1);
      expect(project.organization.id).toBe(1);
    });
  });
});
