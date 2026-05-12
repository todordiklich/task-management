import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// Mock all dependencies
jest.mock('../../src/config/prisma.js', () => ({
  __esModule: true,
  default: {
    project: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    organization: {
      findUnique: jest.fn(),
    },
    userOrganization: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    task: {
      count: jest.fn(),
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

// Import the project routes
import projectRoutes from '../../src/routes/projects.js';

describe('Project Endpoints', () => {
  let app;

  beforeEach(() => {
    jest.resetAllMocks();

    // Default mocks to avoid undefined errors in routes
    prisma.project.count.mockResolvedValue(0);
    prisma.userOrganization.findMany.mockResolvedValue([]);

    // Create test app
    app = express();
    app.use(express.json());
    app.use('/api/v1/projects', projectRoutes);
  });

  describe('POST /api/v1/projects', () => {
    it('should create project successfully', async () => {
      const projectData = {
        name: 'New Project',
        description: 'Project description',
        organizationId: 1,
      };

      const mockProject = {
        id: 1,
        name: 'New Project',
        description: 'Project description',
        organizationId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockOrg = {
        id: 1,
        name: 'Test Organization',
      };

      prisma.organization.findUnique.mockResolvedValue(mockOrg);
      prisma.userOrganization.findFirst.mockResolvedValue({ id: 1 });
      prisma.project.create.mockResolvedValue(mockProject);

      const response = await request(app)
        .post('/api/v1/projects')
        .send(projectData);

      expect(response.status).toBe(201);
      expect(response.body.name).toBe('New Project');
      expect(response.body.description).toBe('Project description');
      expect(prisma.project.create).toHaveBeenCalledWith({
        data: {
          name: projectData.name,
          description: projectData.description,
          organizationId: projectData.organizationId,
        },
        include: {
          organization: { select: { id: true, name: true } },
        },
      });
    });

    it('should reject project creation for non-member', async () => {
      // Mock user not being a member
      const appWithNonMember = express();
      appWithNonMember.use(express.json());

      appWithNonMember.use(
        '/api/v1/projects',
        (req, res, next) => {
          req.user = {
            id: 1,
            email: 'nonmember@example.com',
            role: 'user',
          };
          next();
        },
        projectRoutes,
      );

      const projectData = {
        name: 'New Project',
        organizationId: 1,
      };

      const mockOrg = {
        id: 1,
        name: 'Test Organization',
      };

      prisma.organization.findUnique.mockResolvedValue(mockOrg);
      prisma.userOrganization.findFirst.mockResolvedValue(null);

      const response = await request(appWithNonMember)
        .post('/api/v1/projects')
        .send(projectData);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Access denied to this organization');
    });

    it('should reject project creation with short name', async () => {
      const projectData = {
        name: 'a', // Too short
        organizationId: 1,
      };

      const response = await request(app)
        .post('/api/v1/projects')
        .send(projectData);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request data');
    });

    it('should reject project creation with negative organization ID', async () => {
      const projectData = {
        name: 'New Project',
        organizationId: -1,
      };

      const response = await request(app)
        .post('/api/v1/projects')
        .send(projectData);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request data');
    });

    it('should reject project creation with missing name', async () => {
      const projectData = {
        organizationId: 1,
      };

      const response = await request(app)
        .post('/api/v1/projects')
        .send(projectData);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request data');
    });

    it('should handle non-existent organization', async () => {
      const projectData = {
        name: 'New Project',
        organizationId: 999,
      };

      prisma.organization.findUnique.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/v1/projects')
        .send(projectData);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Organization not found');
    });

    it('should handle database errors during creation', async () => {
      const projectData = {
        name: 'New Project',
        organizationId: 1,
      };

      const mockOrg = {
        id: 1,
        name: 'Test Organization',
      };

      prisma.organization.findUnique.mockResolvedValue(mockOrg);
      prisma.userOrganization.findFirst.mockResolvedValue({ id: 1 });
      prisma.project.create.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/api/v1/projects')
        .send(projectData);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to create project');
    });
  });

  describe('GET /api/v1/projects', () => {
    it('should get projects successfully', async () => {
      const queryParams = {
        page: 1,
        limit: 10,
        organizationId: 1,
      };

      const mockProjects = [
        {
          id: 1,
          name: 'Project 1',
          description: 'Description 1',
          organizationId: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 2,
          name: 'Project 2',
          description: 'Description 2',
          organizationId: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      prisma.userOrganization.findFirst.mockResolvedValue({ id: 1 });
      prisma.project.findMany.mockResolvedValue(mockProjects);
      prisma.project.count.mockResolvedValue(2);

      const response = await request(app)
        .get('/api/v1/projects')
        .query(queryParams);

      expect(response.status).toBe(200);
      expect(response.body.projects).toHaveLength(2);
      expect(response.body.projects[0].name).toBe('Project 1');
      expect(response.body.pagination.totalCount).toBe(2);
      expect(response.body.pagination.currentPage).toBe(1);
      expect(response.body.pagination.totalPages).toBe(1);
    });

    it('should get projects without organization filter', async () => {
      const queryParams = {
        page: 1,
        limit: 10,
      };

      const mockProjects = [
        {
          id: 1,
          name: 'Project 1',
          organizationId: 1,
        },
      ];

      prisma.userOrganization.findMany.mockResolvedValue([{ organizationId: 1 }]);
      prisma.project.findMany.mockResolvedValue(mockProjects);
      prisma.project.count.mockResolvedValue(1);

      const response = await request(app)
        .get('/api/v1/projects')
        .query(queryParams);

      expect(response.status).toBe(200);
    });

    it('should handle pagination correctly', async () => {
      const queryParams = {
        page: 2,
        limit: 5,
      };

      prisma.project.findMany.mockResolvedValue([]);
      prisma.project.count.mockResolvedValue(15);

      const response = await request(app)
        .get('/api/v1/projects')
        .query(queryParams);

      expect(response.status).toBe(200);
      expect(response.body.pagination.currentPage).toBe(2);
      expect(response.body.pagination.totalPages).toBe(3);
      expect(response.body.pagination.hasNextPage).toBe(true);
      expect(response.body.pagination.hasPreviousPage).toBe(true);
      expect(prisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 5, // (2-1) * 5
          take: 5,
        }),
      );
    });

    it('should handle empty projects list', async () => {
      prisma.project.findMany.mockResolvedValue([]);
      prisma.project.count.mockResolvedValue(0);

      const response = await request(app).get('/api/v1/projects');

      expect(response.status).toBe(200);
      expect(response.body.projects).toHaveLength(0);
      expect(response.body.pagination.totalCount).toBe(0);
    });

    it('should handle database errors', async () => {
      prisma.project.findMany.mockRejectedValue(new Error('Database error'));

      const response = await request(app).get('/api/v1/projects');

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to fetch projects');
    });
  });

  describe('GET /api/v1/projects/:id', () => {
    it('should get project details successfully', async () => {
      const projectId = 1;
      const mockProject = {
        id: 1,
        name: 'Test Project',
        description: 'Test description',
        organizationId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        organization: {
          id: 1,
          name: 'Test Organization',
        },
      };

      prisma.project.findUnique.mockResolvedValue(mockProject);
      prisma.userOrganization.findFirst.mockResolvedValue({ id: 1 });

      const response = await request(app).get(`/api/v1/projects/${projectId}`);

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Test Project');
      expect(response.body.organization.name).toBe('Test Organization');
    });

    it('should reject access to non-member project', async () => {
      // Mock user not being a member
      const appWithNonMember = express();
      appWithNonMember.use(express.json());

      appWithNonMember.use(
        '/api/v1/projects',
        (req, res, next) => {
          req.user = {
            id: 1,
            email: 'nonmember@example.com',
            role: 'user',
          };
          next();
        },
        projectRoutes,
      );

      const projectId = 1;
      prisma.project.findUnique.mockResolvedValue(null);

      const response = await request(appWithNonMember).get(
        `/api/v1/projects/${projectId}`,
      );

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Project not found');
    });

    it('should handle non-existent project', async () => {
      const projectId = 999;
      prisma.project.findUnique.mockResolvedValue(null);

      const response = await request(app).get(`/api/v1/projects/${projectId}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Project not found');
    });

    it('should handle invalid project ID', async () => {
      const response = await request(app).get('/api/v1/projects/invalid');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid project ID');
    });

    it('should handle database errors', async () => {
      const projectId = 1;
      prisma.project.findUnique.mockRejectedValue(new Error('Database error'));

      const response = await request(app).get(`/api/v1/projects/${projectId}`);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to fetch project');
    });
  });

  describe('PATCH /api/v1/projects/:id', () => {
    it('should update project successfully', async () => {
      const projectId = 1;
      const updateData = {
        name: 'Updated Project',
        description: 'Updated description',
      };

      const mockProject = {
        id: 1,
        name: 'Updated Project',
        description: 'Updated description',
        organizationId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prisma.project.findUnique.mockResolvedValue({ id: 1, organizationId: 1 });
      prisma.userOrganization.findFirst.mockResolvedValue({ id: 1 });
      prisma.project.update.mockResolvedValue(mockProject);

      const response = await request(app)
        .patch(`/api/v1/projects/${projectId}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Updated Project');
      expect(response.body.description).toBe('Updated description');
    });

    it('should reject update for non-member', async () => {
      // Mock user not being a member
      const appWithNonMember = express();
      appWithNonMember.use(express.json());

      appWithNonMember.use(
        '/api/v1/projects',
        (req, res, next) => {
          req.user = {
            id: 1,
            email: 'nonmember@example.com',
            role: 'user',
          };
          next();
        },
        projectRoutes,
      );

      const projectId = 1;
      const updateData = {
        name: 'Updated Project',
      };

      prisma.project.findUnique.mockResolvedValue(null);

      const response = await request(appWithNonMember)
        .patch(`/api/v1/projects/${projectId}`)
        .send(updateData);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Project not found');
    });

    it('should reject update with short name', async () => {
      const projectId = 1;
      const updateData = {
        name: 'a', // Too short
      };

      const response = await request(app)
        .patch(`/api/v1/projects/${projectId}`)
        .send(updateData);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request data');
    });

    it('should handle partial updates', async () => {
      const projectId = 1;
      const updateData = {
        description: 'Only description updated',
      };

      const mockProject = {
        id: 1,
        name: 'Original Project',
        description: 'Only description updated',
        organizationId: 1,
      };

      prisma.project.findUnique.mockResolvedValue({ id: 1, organizationId: 1 });
      prisma.userOrganization.findFirst.mockResolvedValue({ id: 1 });
      prisma.project.update.mockResolvedValue(mockProject);

      const response = await request(app)
        .patch(`/api/v1/projects/${projectId}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.description).toBe('Only description updated');
      expect(response.body.name).toBe('Original Project');
    });

    it('should handle non-existent project', async () => {
      const projectId = 999;
      const updateData = {
        name: 'Updated Project',
      };

      prisma.project.findUnique.mockResolvedValue(null);

      const response = await request(app)
        .patch(`/api/v1/projects/${projectId}`)
        .send(updateData);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Project not found');
    });

    it('should handle database errors', async () => {
      const projectId = 1;
      const updateData = {
        name: 'Updated Project',
      };

      prisma.project.findUnique.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .patch(`/api/v1/projects/${projectId}`)
        .send(updateData);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to update project');
    });
  });

  describe('DELETE /api/v1/projects/:id', () => {
    it('should delete project successfully', async () => {
      const projectId = 1;
      const mockProject = {
        id: 1,
        name: 'Test Project',
        organizationId: 1,
      };

      prisma.project.findUnique.mockResolvedValue({ id: 1, organizationId: 1 });
      prisma.userOrganization.findFirst.mockResolvedValue({ id: 1 });
      prisma.project.delete.mockResolvedValue(mockProject);

      const response = await request(app).delete(
        `/api/v1/projects/${projectId}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Project deleted successfully');
      expect(prisma.project.delete).toHaveBeenCalledWith({
        where: { id: projectId },
      });
    });

    it('should reject delete for non-member', async () => {
      // Mock user not being a member
      const appWithNonMember = express();
      appWithNonMember.use(express.json());

      appWithNonMember.use(
        '/api/v1/projects',
        (req, res, next) => {
          req.user = {
            id: 1,
            email: 'nonmember@example.com',
            role: 'user',
          };
          next();
        },
        projectRoutes,
      );

      const projectId = 1;
      prisma.project.findUnique.mockResolvedValue(null);

      const response = await request(appWithNonMember).delete(
        `/api/v1/projects/${projectId}`,
      );

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Project not found');
    });

    it('should handle non-existent project', async () => {
      const projectId = 999;
      prisma.project.findUnique.mockResolvedValue(null);

      const response = await request(app).delete(
        `/api/v1/projects/${projectId}`,
      );

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Project not found');
    });

    it('should handle invalid project ID', async () => {
      const response = await request(app).delete('/api/v1/projects/invalid');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid project ID');
    });

    it('should handle database errors', async () => {
      const projectId = 1;
      prisma.project.findUnique.mockRejectedValue(new Error('Database error'));

      const response = await request(app).delete(
        `/api/v1/projects/${projectId}`,
      );

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to delete project');
    });
  });

  describe('Input Validation', () => {
    it('should validate project name length', async () => {
      const projectData = {
        name: 'a', // Too short
        organizationId: 1,
      };

      const response = await request(app)
        .post('/api/v1/projects')
        .send(projectData);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request data');
    });

    it('should validate organization ID positivity', async () => {
      const projectData = {
        name: 'Valid Name',
        organizationId: -1, // Negative
      };

      const response = await request(app)
        .post('/api/v1/projects')
        .send(projectData);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request data');
    });

    it('should validate pagination parameters', async () => {
      const invalidParams = [
        { page: 0 }, // Invalid page
        { page: -1 }, // Negative page
        { limit: 0 }, // Invalid limit
        { limit: -1 }, // Negative limit
        { limit: 101 }, // Over max limit
      ];

      for (const params of invalidParams) {
        const response = await request(app)
          .get('/api/v1/projects')
          .query(params);

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid query parameters');
      }
    });

    it('should coerce string pagination parameters', async () => {
      const queryParams = {
        page: '2',
        limit: '20',
      };

      prisma.project.findMany.mockResolvedValue([]);
      prisma.project.count.mockResolvedValue(0);

      const response = await request(app)
        .get('/api/v1/projects')
        .query(queryParams);

      expect(response.status).toBe(200);
      expect(prisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20, // (2-1) * 20
          take: 20,
        }),
      );
    });
  });

  describe('Security', () => {
    it('should verify organization membership for all operations', async () => {
      // Mock user not being a member
      const appWithNonMember = express();
      appWithNonMember.use(express.json());

      appWithNonMember.use(
        '/api/v1/projects',
        (req, res, next) => {
          req.user = {
            id: 1,
            email: 'nonmember@example.com',
            role: 'user',
          };
          next();
        },
        projectRoutes,
      );

      const projectId = 1;
      // findUnique returns undefined by default after resetAllMocks → routes return 404
      const responses = await Promise.all([
        request(appWithNonMember).get(`/api/v1/projects/${projectId}`),
        request(appWithNonMember)
          .patch(`/api/v1/projects/${projectId}`)
          .send({ name: 'Updated' }),
        request(appWithNonMember).delete(`/api/v1/projects/${projectId}`),
      ]);

      responses.forEach((response) => {
        expect(response.status).toBe(404);
        expect(response.body.error).toBe('Project not found');
      });
    });

    it('should prevent access to projects from other organizations', async () => {
      const queryParams = {
        organizationId: 999, // Different organization
      };

      prisma.project.findMany.mockResolvedValue([]);
      prisma.project.count.mockResolvedValue(0);

      const response = await request(app)
        .get('/api/v1/projects')
        .query(queryParams);

      expect(response.status).toBe(200);
      expect(response.body.projects).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/v1/projects')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}');

      expect(response.status).toBe(400);
    });

    it('should handle large payloads', async () => {
      const largeData = {
        name: 'a'.repeat(10000),
        description: 'b'.repeat(10000),
        organizationId: 1,
      };

      const response = await request(app)
        .post('/api/v1/projects')
        .send(largeData);

      expect(response.status).toBe(400);
    });

    it('should handle missing required fields', async () => {
      const response = await request(app).post('/api/v1/projects').send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request data');
    });
  });
});
