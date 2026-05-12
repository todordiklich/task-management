import express from 'express';
import prisma from '../config/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { createProjectSchema, updateProjectSchema, listProjectsSchema } from '../utils/validation.js';

const router = express.Router();

// Helper function to check if user has access to organization
async function checkOrganizationAccess(userId, organizationId) {
  const membership = await prisma.userOrganization.findFirst({
    where: {
      userId,
      organizationId,
    },
  });
  
  return membership !== null;
}

// POST /projects - Create new project
router.post('/', authenticate, async (req, res) => {
  try {
    // Validate request body
    const validationResult = createProjectSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Invalid request data',
        details: validationResult.error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      });
    }

    const { name, description, organizationId } = validationResult.data;
    const userId = req.user?.id;

    // Check if organization exists
    const org = await prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    // Check if user has access to the organization
    const hasAccess = await checkOrganizationAccess(userId, organizationId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this organization' });
    }

    // Create project
    const project = await prisma.project.create({
      data: {
        name,
        description,
        organizationId,
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    res.status(201).json(project);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to create project',
      details: error.message 
    });
  }
});

// GET /projects - List projects with pagination
router.get('/', authenticate, async (req, res) => {
  try {
    // Validate query parameters
    const validationResult = listProjectsSchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Invalid query parameters',
        details: validationResult.error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      });
    }

    const { page, limit, organizationId } = validationResult.data;
    const userId = req.user?.id;

    // Build where clause
    let whereClause = {};

    // If organizationId is specified, check access and filter by it
    if (organizationId) {
      const hasAccess = await checkOrganizationAccess(userId, organizationId);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied to this organization' });
      }
      whereClause.organizationId = organizationId;
    } else {
      // If no organization specified, get projects from all user's organizations
      const userOrganizations = await prisma.userOrganization.findMany({
        where: { userId },
        select: { organizationId: true },
      });
      
      whereClause.organizationId = {
        in: userOrganizations.map(uo => uo.organizationId),
      };
    }

    // Get total count for pagination
    const totalCount = await prisma.project.count({ where: whereClause });

    // Get paginated projects
    const projects = await prisma.project.findMany({
      where: whereClause,
      include: {
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            tasks: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    res.json({
      projects,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        limit,
        hasNextPage,
        hasPreviousPage,
      },
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch projects',
      details: error.message 
    });
  }
});

// GET /projects/:id - Get single project
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const projectId = parseInt(id);
    const userId = req.user?.id;

    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    // Get project
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
        tasks: {
          include: {
            assignee: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
        _count: {
          select: {
            tasks: true,
          },
        },
      },
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check if user has access to the project's organization
    const hasAccess = await checkOrganizationAccess(userId, project.organizationId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this project' });
    }

    res.json(project);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch project',
      details: error.message 
    });
  }
});

// PATCH /projects/:id - Update project
router.patch('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const projectId = parseInt(id);
    const userId = req.user?.id;

    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    // Validate request body
    const validationResult = updateProjectSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Invalid request data',
        details: validationResult.error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      });
    }

    // Check if project exists and user has access
    const existingProject = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, organizationId: true },
    });

    if (!existingProject) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const hasAccess = await checkOrganizationAccess(userId, existingProject.organizationId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this project' });
    }

    // Update project
    const updatedProject = await prisma.project.update({
      where: { id: projectId },
      data: validationResult.data,
      include: {
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            tasks: true,
          },
        },
      },
    });

    res.json(updatedProject);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to update project',
      details: error.message 
    });
  }
});

// DELETE /projects/:id - Delete project
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const projectId = parseInt(id);
    const userId = req.user?.id;

    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    // Check if project exists and user has access
    const existingProject = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, organizationId: true },
    });

    if (!existingProject) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const hasAccess = await checkOrganizationAccess(userId, existingProject.organizationId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this project' });
    }

    // Delete project (cascade will delete related tasks)
    await prisma.project.delete({
      where: { id: projectId },
    });

    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to delete project',
      details: error.message 
    });
  }
});

export default router;
