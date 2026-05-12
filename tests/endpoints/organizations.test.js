import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// Mock all dependencies
jest.mock('../../src/config/prisma.js', () => ({
  __esModule: true,
  default: {
    organization: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    userOrganization: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    invitation: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    organizationRole: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
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
  },
}));

import prisma from '../../src/config/prisma.js';

// Mock authenticate middleware
jest.mock('../../src/middleware/auth.js', () => ({
  authenticate: (req, res, next) => {
    // Mock authenticated user
    req.user = {
      id: 1,
      email: 'test@example.com',
      role: 'user',
    };
    next();
  },
}));

// Import the organization routes
import organizationRoutes from '../../src/routes/organizations.js';

describe('Organization Endpoints', () => {
  let app;

  beforeEach(() => {
    jest.resetAllMocks();

    // Default: $transaction calls the callback with prisma
    prisma.$transaction.mockImplementation(async (cb) => cb(prisma));
    // Default admin role for org creation
    prisma.organizationRole.findFirst.mockResolvedValue({ id: 1, name: 'admin' });
    // Default: user is a member (for members endpoint)
    prisma.userOrganization.findFirst.mockResolvedValue({ id: 1 });

    // Create test app
    app = express();
    app.use(express.json());
    app.use('/api/v1/organizations', organizationRoutes);
  });

  describe('GET /api/v1/organizations', () => {
    it('should get user organizations successfully', async () => {
      const mockUserOrgs = [
        {
          id: 1,
          organization: { id: 1, name: 'Test Organization', description: 'Test description', createdAt: new Date() },
          role: { name: 'admin' },
          user: { id: 1, email: 'test@example.com' },
        },
        {
          id: 2,
          organization: { id: 2, name: 'Another Organization', description: 'Another description', createdAt: new Date() },
          role: { name: 'member' },
          user: { id: 1, email: 'test@example.com' },
        },
      ];

      prisma.userOrganization.findMany.mockResolvedValue(mockUserOrgs);

      const response = await request(app).get('/api/v1/organizations');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body[0].name).toBe('Test Organization');
      expect(response.body[1].name).toBe('Another Organization');
    });

    it('should handle empty organizations list', async () => {
      prisma.userOrganization.findMany.mockResolvedValue([]);

      const response = await request(app).get('/api/v1/organizations');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(0);
    });

    it('should handle database errors', async () => {
      prisma.userOrganization.findMany.mockRejectedValue(
        new Error('Database error'),
      );

      const response = await request(app).get('/api/v1/organizations');

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to fetch organizations');
    });
  });

  describe('POST /api/v1/organizations', () => {
    it('should create organization successfully', async () => {
      const orgData = {
        name: 'New Organization',
        description: 'New description',
      };

      const mockOrg = {
        id: 1,
        name: 'New Organization',
        description: 'New description',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockRole = {
        id: 1,
        name: 'admin',
      };

      prisma.organization.create.mockResolvedValue(mockOrg);
      prisma.organizationRole.findFirst.mockResolvedValue(mockRole);
      prisma.userOrganization.create.mockResolvedValue({ id: 1 });
      prisma.user.findUnique.mockResolvedValue({ email: 'test@example.com', name: 'Test User' });

      const response = await request(app)
        .post('/api/v1/organizations')
        .send(orgData);

      expect(response.status).toBe(201);
      expect(response.body.name).toBe('New Organization');
      expect(response.body.description).toBe('New description');
    });

    it('should reject organization creation with short name', async () => {
      const orgData = {
        name: 'a', // Too short
        description: 'Test description',
      };

      const response = await request(app)
        .post('/api/v1/organizations')
        .send(orgData);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request data');
      expect(prisma.organization.create).not.toHaveBeenCalled();
    });

    it('should reject organization creation with missing name', async () => {
      const orgData = {
        description: 'Test description',
      };

      const response = await request(app)
        .post('/api/v1/organizations')
        .send(orgData);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request data');
    });

    it('should handle database errors during creation', async () => {
      const orgData = {
        name: 'New Organization',
        description: 'New description',
      };

      prisma.$transaction.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/api/v1/organizations')
        .send(orgData);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to create organization');
    });

    it('should handle role lookup errors', async () => {
      const orgData = {
        name: 'New Organization',
        description: 'New description',
      };

      const mockOrg = {
        id: 1,
        name: 'New Organization',
        description: 'New description',
      };

      prisma.organization.create.mockResolvedValue(mockOrg);
      prisma.organizationRole.findFirst.mockRejectedValue(
        new Error('Role error'),
      );

      const response = await request(app)
        .post('/api/v1/organizations')
        .send(orgData);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to create organization');
    });
  });

  describe('POST /api/v1/organizations/:id/invite', () => {
    it('should send invitation successfully', async () => {
      const orgId = 1;
      const inviteData = {
        email: 'invite@example.com',
        roleName: 'Developer',
      };

      const mockOrg = {
        id: 1,
        name: 'Test Organization',
      };

      const mockRole = {
        id: 2,
        name: 'Developer',
      };

      const mockInvitation = {
        id: 1,
        token: 'invitation_token_123',
        email: 'invite@example.com',
        organizationId: 1,
        roleId: 2,
        inviterId: 1,
        status: 'pending',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };

      // Admin check must pass, then existing membership check → null
      prisma.userOrganization.findFirst
        .mockResolvedValueOnce({ id: 1, role: { name: 'admin' } })
        .mockResolvedValueOnce(null);
      prisma.organization.findUnique.mockResolvedValue(mockOrg);
      prisma.user.findUnique.mockResolvedValue({ id: 2, email: 'invite@example.com', name: 'Invite User' });
      prisma.invitation.findFirst.mockResolvedValue(null);
      prisma.organizationRole.findUnique.mockResolvedValue(mockRole);
      prisma.invitation.create.mockResolvedValue({ ...mockInvitation, organization: mockOrg, role: mockRole, inviter: { id: 1, name: 'Admin', email: 'admin@example.com' } });

      const response = await request(app)
        .post(`/api/v1/organizations/${orgId}/invite`)
        .send(inviteData);

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('Invitation sent successfully');
      expect(response.body.invitation.invitedUser.email).toBe('invite@example.com');
      expect(prisma.invitation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: inviteData.email,
            organizationId: orgId,
            roleId: 2,
            inviterId: 1,
            status: 'pending',
          }),
        }),
      );
    });

    it('should reject invitation for non-existent organization', async () => {
      const orgId = 999;
      const inviteData = {
        email: 'invite@example.com',
      };

      prisma.userOrganization.findFirst.mockResolvedValue({ id: 1, role: { name: 'admin' } });
      prisma.organization.findUnique.mockResolvedValue(null);

      const response = await request(app)
        .post(`/api/v1/organizations/${orgId}/invite`)
        .send(inviteData);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Organization not found');
      expect(prisma.invitation.create).not.toHaveBeenCalled();
    });

    it('should reject invitation for non-member', async () => {
      // Mock user not being a member
      const appWithNonMember = express();
      appWithNonMember.use(express.json());

      appWithNonMember.use(
        '/api/v1/organizations',
        (req, res, next) => {
          req.user = {
            id: 1,
            email: 'nonmember@example.com',
            role: 'user',
          };
          next();
        },
        organizationRoutes,
      );

      const orgId = 1;
      const inviteData = {
        email: 'invite@example.com',
      };

      const mockOrg = {
        id: 1,
        name: 'Test Organization',
      };

      prisma.organization.findUnique.mockResolvedValue(mockOrg);
      prisma.userOrganization.findFirst.mockResolvedValue(null);

      const response = await request(appWithNonMember)
        .post(`/api/v1/organizations/${orgId}/invite`)
        .send(inviteData);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Only admins can invite members');
    });

    it('should reject invitation with invalid email', async () => {
      const orgId = 1;
      const inviteData = {
        email: 'invalid-email',
      };

      const response = await request(app)
        .post(`/api/v1/organizations/${orgId}/invite`)
        .send(inviteData);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request data');
    });

    it('should reject invitation with missing email', async () => {
      const orgId = 1;
      const inviteData = {
        roleName: 'Developer',
      };

      const response = await request(app)
        .post(`/api/v1/organizations/${orgId}/invite`)
        .send(inviteData);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request data');
    });

    it('should handle database errors during invitation', async () => {
      const orgId = 1;
      const inviteData = {
        email: 'invite@example.com',
      };

      prisma.userOrganization.findFirst.mockResolvedValue({ id: 1, role: { name: 'admin' } });
      prisma.organization.findUnique.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post(`/api/v1/organizations/${orgId}/invite`)
        .send(inviteData);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to send invitation');
    });
  });

  describe('POST /api/v1/organizations/accept-invitation', () => {
    it('should accept invitation successfully', async () => {
      const inviteData = {
        token: 'valid_invitation_token',
      };

      const mockInvitation = {
        id: 1,
        token: 'valid_invitation_token',
        email: 'invite@example.com',
        organizationId: 1,
        roleId: 2,
        status: 'pending',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
      };

      const mockUser = {
        id: 1,
        email: 'invite@example.com',
      };

      const mockMembership = {
        id: 1,
        userId: 1,
        organizationId: 1,
        roleId: 2,
      };

      prisma.invitation.findFirst.mockResolvedValue(mockInvitation);
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.userOrganization.create.mockResolvedValue(mockMembership);
      prisma.invitation.update.mockResolvedValue({ ...mockInvitation, status: 'accepted' });

      const response = await request(app)
        .post('/api/v1/organizations/accept-invitation')
        .send(inviteData);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Invitation accepted successfully');
      expect(response.body.membership).toEqual(mockMembership);
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should reject acceptance with invalid token', async () => {
      const inviteData = {
        token: 'invalid_token',
      };

      prisma.invitation.findFirst.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/v1/organizations/accept-invitation')
        .send(inviteData);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Invalid or expired invitation');
    });

    it('should reject acceptance of expired invitation', async () => {
      const inviteData = {
        token: 'expired_token',
      };

      const mockInvitation = {
        id: 1,
        token: 'expired_token',
        email: 'invite@example.com',
        organizationId: 1,
        roleId: 2,
        status: 'pending',
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
      };

      prisma.invitation.findFirst.mockResolvedValue(mockInvitation);

      const response = await request(app)
        .post('/api/v1/organizations/accept-invitation')
        .send(inviteData);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Invalid or expired invitation');
    });

    it('should reject acceptance of already accepted invitation', async () => {
      const inviteData = {
        token: 'accepted_token',
      };

      const mockInvitation = {
        id: 1,
        token: 'accepted_token',
        email: 'invite@example.com',
        organizationId: 1,
        roleId: 2,
        status: 'accepted', // Already accepted
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      prisma.invitation.findFirst.mockResolvedValue(mockInvitation);

      const response = await request(app)
        .post('/api/v1/organizations/accept-invitation')
        .send(inviteData);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Invalid or expired invitation');
    });

    it('should reject acceptance when user email does not match', async () => {
      const inviteData = {
        token: 'valid_token',
      };

      const mockInvitation = {
        id: 1,
        token: 'valid_token',
        email: 'different@example.com', // Different email
        organizationId: 1,
        roleId: 2,
        status: 'pending',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      const mockUser = {
        id: 1,
        email: 'invite@example.com', // Different email
      };

      prisma.invitation.findFirst.mockResolvedValue(mockInvitation);
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const response = await request(app)
        .post('/api/v1/organizations/accept-invitation')
        .send(inviteData);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('This invitation is not for your email');
    });

    it('should reject acceptance with missing token', async () => {
      const response = await request(app)
        .post('/api/v1/organizations/accept-invitation')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request data');
    });

    it('should handle database errors during acceptance', async () => {
      const inviteData = {
        token: 'valid_token',
      };

      prisma.invitation.findFirst.mockRejectedValue(
        new Error('Database error'),
      );

      const response = await request(app)
        .post('/api/v1/organizations/accept-invitation')
        .send(inviteData);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to accept invitation');
    });
  });

  describe('GET /api/v1/organizations/:id/members', () => {
    it('should get organization members successfully', async () => {
      const orgId = 1;
      const mockMembers = [
        {
          id: 1,
          userId: 1,
          organizationId: 1,
          roleId: 1,
          user: {
            id: 1,
            email: 'admin@example.com',
            name: 'Admin User',
          },
          role: {
            id: 1,
            name: 'admin',
          },
        },
        {
          id: 2,
          userId: 2,
          organizationId: 1,
          roleId: 2,
          user: {
            id: 2,
            email: 'member@example.com',
            name: 'Member User',
          },
          role: {
            id: 2,
            name: 'member',
          },
        },
      ];

      const mockOrg = {
        id: 1,
        name: 'Test Organization',
      };

      prisma.organization.findUnique.mockResolvedValue(mockOrg);
      prisma.userOrganization.findMany.mockResolvedValue(mockMembers);

      const response = await request(app).get(
        `/api/v1/organizations/${orgId}/members`,
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body[0].user.email).toBe('admin@example.com');
      expect(response.body[1].user.email).toBe('member@example.com');
    });

    it('should reject access for non-members', async () => {
      // Mock user not being a member
      const appWithNonMember = express();
      appWithNonMember.use(express.json());

      appWithNonMember.use(
        '/api/v1/organizations',
        (req, res, next) => {
          req.user = {
            id: 1,
            email: 'nonmember@example.com',
            role: 'user',
          };
          next();
        },
        organizationRoutes,
      );

      const orgId = 1;
      const mockOrg = {
        id: 1,
        name: 'Test Organization',
      };

      prisma.organization.findUnique.mockResolvedValue(mockOrg);
      prisma.userOrganization.findFirst.mockResolvedValue(null); // Not a member

      const response = await request(appWithNonMember).get(
        `/api/v1/organizations/${orgId}/members`,
      );

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Access denied');
    });

    it('should handle non-existent organization', async () => {
      const orgId = 999;
      prisma.organization.findUnique.mockResolvedValue(null);

      const response = await request(app).get(
        `/api/v1/organizations/${orgId}/members`,
      );

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Organization not found');
    });

    it('should handle empty members list', async () => {
      const orgId = 1;
      const mockOrg = {
        id: 1,
        name: 'Test Organization',
      };

      prisma.organization.findUnique.mockResolvedValue(mockOrg);
      prisma.userOrganization.findMany.mockResolvedValue([]);
      // userOrganization.findFirst default (user is a member) is set in beforeEach

      const response = await request(app).get(
        `/api/v1/organizations/${orgId}/members`,
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(0);
    });

    it('should handle database errors', async () => {
      const orgId = 1;
      prisma.organization.findUnique.mockRejectedValue(
        new Error('Database error'),
      );

      const response = await request(app).get(
        `/api/v1/organizations/${orgId}/members`,
      );

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to fetch members');
    });
  });

  describe('Input Validation', () => {
    it('should validate organization name length', async () => {
      const orgData = {
        name: 'a', // Too short
        description: 'Test description',
      };

      const response = await request(app)
        .post('/api/v1/organizations')
        .send(orgData);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request data');
    });

    it('should validate invitation email format', async () => {
      const invalidEmails = [
        'invalid',
        'test@',
        '@example.com',
        'test.example.com',
        'test@.com',
      ];

      for (const email of invalidEmails) {
        const response = await request(app)
          .post('/api/v1/organizations/1/invite')
          .send({ email });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid request data');
      }
    });

    it('should validate role name length', async () => {
      const response = await request(app)
        .post('/api/v1/organizations/1/invite')
        .send({
          email: 'test@example.com',
          roleName: 'a', // Too short
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request data');
    });
  });

  describe('Security', () => {
    it('should use atomic transactions for invitation acceptance', async () => {
      const inviteData = {
        token: 'valid_token',
      };

      const mockInvitation = {
        id: 1,
        token: 'valid_token',
        email: 'invite@example.com',
        organizationId: 1,
        roleId: 2,
        status: 'pending',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      const mockUser = {
        id: 1,
        email: 'invite@example.com',
      };

      prisma.invitation.findFirst.mockResolvedValue(mockInvitation);
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.$transaction.mockImplementation(async (callback) => {
        return await callback(prisma);
      });
      prisma.userOrganization.create.mockResolvedValue({ id: 1 });
      prisma.invitation.update.mockResolvedValue({
        ...mockInvitation,
        status: 'accepted',
      });

      await request(app)
        .post('/api/v1/organizations/accept-invitation')
        .send(inviteData);

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should prevent invitation reuse', async () => {
      const inviteData = {
        token: 'used_token',
      };

      const mockInvitation = {
        id: 1,
        token: 'used_token',
        email: 'invite@example.com',
        organizationId: 1,
        roleId: 2,
        status: 'accepted', // Already used
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      prisma.invitation.findFirst.mockResolvedValue(mockInvitation);

      const response = await request(app)
        .post('/api/v1/organizations/accept-invitation')
        .send(inviteData);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Invalid or expired invitation');
    });

    it('should verify organization membership for sensitive operations', async () => {
      // Mock user not being a member
      const appWithNonMember = express();
      appWithNonMember.use(express.json());

      appWithNonMember.use(
        '/api/v1/organizations',
        (req, res, next) => {
          req.user = {
            id: 1,
            email: 'nonmember@example.com',
            role: 'user',
          };
          next();
        },
        organizationRoutes,
      );

      const orgId = 1;
      const mockOrg = {
        id: 1,
        name: 'Test Organization',
      };

      prisma.organization.findUnique.mockResolvedValue(mockOrg);
      prisma.userOrganization.findFirst.mockResolvedValue(null); // Not a member

      const inviteResponse = await request(appWithNonMember)
        .post(`/api/v1/organizations/${orgId}/invite`)
        .send({ email: 'test@example.com' });

      const membersResponse = await request(appWithNonMember).get(
        `/api/v1/organizations/${orgId}/members`,
      );

      expect(inviteResponse.status).toBe(403);
      expect(membersResponse.status).toBe(403);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/v1/organizations')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}');

      expect(response.status).toBe(400);
    });

    it('should handle large payloads', async () => {
      const largeData = {
        name: 'a'.repeat(10000),
        description: 'b'.repeat(10000),
      };

      const response = await request(app)
        .post('/api/v1/organizations')
        .send(largeData);

      expect(response.status).toBe(400);
    });

    it('should handle invalid organization ID', async () => {
      const response = await request(app).get(
        '/api/v1/organizations/invalid/members',
      );

      expect(response.status).toBe(400);
    });
  });
});
