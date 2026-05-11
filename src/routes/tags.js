import express from 'express';
import prisma from '../config/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { createTagSchema, listTagsSchema, attachTagSchema } from '../utils/validation.js';

const router = express.Router();

// Helper function to check if user has access to task
async function checkTaskAccess(userId, taskId) {
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      project: {
        organization: {
          users: {
            some: {
              userId: userId,
            },
          },
        },
      },
    },
    select: { id: true },
  });
  
  return task !== null;
}

// Helper function to check if user has access to organization
async function checkOrganizationAccess(userId, organizationId) {
  const organization = await prisma.organization.findFirst({
    where: {
      id: organizationId,
      users: {
        some: {
          userId: userId,
        },
      },
    },
    select: { id: true },
  });
  
  return organization !== null;
}

// POST /tags - Create new tag
router.post('/', authenticate, async (req, res) => {
  try {
    // Validate request body
    const validationResult = createTagSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Invalid request data',
        details: validationResult.error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      });
    }

    const { name, color } = validationResult.data;
    const userId = req.user?.id;

    // Check if tag name already exists (tags are global for now)
    const existingTag = await prisma.tag.findUnique({
      where: { name },
    });

    if (existingTag) {
      return res.status(400).json({ 
        error: 'Tag already exists',
        details: `Tag with name "${name}" already exists`
      });
    }

    // Generate random color if not provided
    const tagColor = color || `#${Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')}`;

    // Create tag
    const tag = await prisma.tag.create({
      data: {
        name,
        color: tagColor,
      },
    });

    res.status(201).json(tag);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to create tag',
      details: error.message 
    });
  }
});

// GET /tags - List tags with pagination
router.get('/', authenticate, async (req, res) => {
  try {
    // Validate query parameters
    const validationResult = listTagsSchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Invalid query parameters',
        details: validationResult.error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      });
    }

    const { page, limit, name } = validationResult.data;

    // Build where clause
    let whereClause = {};
    if (name) {
      whereClause.name = {
        contains: name,
        mode: 'insensitive',
      };
    }

    // Get total count for pagination
    const totalCount = await prisma.tag.count({ where: whereClause });

    // Get paginated tags with usage count
    const tags = await prisma.tag.findMany({
      where: whereClause,
      include: {
        _count: {
          select: {
            tasks: true,
          },
        },
      },
      orderBy: [
        { name: 'asc' },
      ],
      skip: (page - 1) * limit,
      take: limit,
    });

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    res.json({
      tags,
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
      error: 'Failed to fetch tags',
      details: error.message 
    });
  }
});

// POST /tasks/:taskId/tags - Attach tag to task
router.post('/tasks/:taskId/tags', authenticate, async (req, res) => {
  try {
    const { taskId } = req.params;
    const parsedTaskId = parseInt(taskId);
    const userId = req.user?.id;

    if (isNaN(parsedTaskId)) {
      return res.status(400).json({ error: 'Invalid task ID' });
    }

    // Validate request body
    const validationResult = attachTagSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Invalid request data',
        details: validationResult.error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      });
    }

    const { tagId } = validationResult.data;

    // Check if user has access to task
    const hasAccess = await checkTaskAccess(userId, parsedTaskId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this task' });
    }

    // Check if task exists
    const task = await prisma.task.findUnique({
      where: { id: parsedTaskId },
      select: { id: true },
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Check if tag exists
    const tag = await prisma.tag.findUnique({
      where: { id: tagId },
      select: { id: true, name: true, color: true },
    });

    if (!tag) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    // Check if tag is already attached to task
    const existingAttachment = await prisma.taskTag.findUnique({
      where: {
        taskId_tagId: {
          taskId: parsedTaskId,
          tagId: tagId,
        },
      },
    });

    if (existingAttachment) {
      return res.status(400).json({ 
        error: 'Tag already attached',
        details: 'This tag is already attached to the task'
      });
    }

    // Attach tag to task
    const taskTag = await prisma.taskTag.create({
      data: {
        taskId: parsedTaskId,
        tagId: tagId,
      },
      include: {
        tag: true,
        task: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    res.status(201).json({
      message: 'Tag attached to task successfully',
      taskTag,
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to attach tag to task',
      details: error.message 
    });
  }
});

// DELETE /tasks/:taskId/tags/:tagId - Detach tag from task
router.delete('/tasks/:taskId/tags/:tagId', authenticate, async (req, res) => {
  try {
    const { taskId, tagId } = req.params;
    const parsedTaskId = parseInt(taskId);
    const parsedTagId = parseInt(tagId);
    const userId = req.user?.id;

    if (isNaN(parsedTaskId) || isNaN(parsedTagId)) {
      return res.status(400).json({ error: 'Invalid task ID or tag ID' });
    }

    // Check if user has access to task
    const hasAccess = await checkTaskAccess(userId, parsedTaskId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this task' });
    }

    // Check if tag attachment exists
    const taskTag = await prisma.taskTag.findUnique({
      where: {
        taskId_tagId: {
          taskId: parsedTaskId,
          tagId: parsedTagId,
        },
      },
      include: {
        tag: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!taskTag) {
      return res.status(404).json({ error: 'Tag attachment not found' });
    }

    // Detach tag from task
    await prisma.taskTag.delete({
      where: {
        taskId_tagId: {
          taskId: parsedTaskId,
          tagId: parsedTagId,
        },
      },
    });

    res.json({
      message: 'Tag detached from task successfully',
      detachedTag: taskTag.tag,
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to detach tag from task',
      details: error.message 
    });
  }
});

export default router;
