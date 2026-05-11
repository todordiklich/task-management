import express from 'express';
import { authenticate } from '../middleware/auth.js';
import prisma from '../config/prisma.js';
import { createTaskSchema, updateTaskSchema, updateTaskStatusSchema, listTasksSchema } from '../utils/validation.js';

const router = express.Router();

// Helper function to check if user has access to project
async function checkProjectAccess(userId, projectId) {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      organization: {
        users: {
          some: {
            userId: userId,
          },
        },
      },
    },
    select: {
      id: true,
    },
  });

  return !!project;
}

// Helper function to get due date filter
function getDueDateFilter(dueDateFilter) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);

  switch (dueDateFilter) {
    case 'overdue':
      return { lt: today };
    case 'due_today':
      return { gte: today, lt: tomorrow };
    case 'due_soon':
      return { gte: today, lt: nextWeek };
    case 'due_later':
      return { gte: nextWeek };
    default:
      return undefined;
  }
}

// POST /tasks - Create new task
router.post('/', authenticate, async (req, res) => {
  try {
    // Validate request body
    const validationResult = createTaskSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Invalid request data',
        details: validationResult.error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      });
    }

    const { title, description, projectId, assigneeId, dueDate, completed } = validationResult.data;
    const userId = req.user?.id;

    // Check if user has access to project
    const hasAccess = await checkProjectAccess(userId, projectId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this project' });
    }

    // Create task
    const task = await prisma.task.create({
      data: {
        title,
        description,
        projectId,
        assigneeId,
        dueDate: dueDate ? new Date(dueDate) : null,
        completed,
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
          },
        },
        assignee: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    res.status(201).json(task);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to create task',
      details: error.message 
    });
  }
});

// GET /tasks - List tasks with pagination and filters
router.get('/', authenticate, async (req, res) => {
  try {
    // Validate query parameters
    const validationResult = listTasksSchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Invalid query parameters',
        details: validationResult.error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      });
    }

    const { page, limit, projectId, assigneeId, completed, dueDate } = validationResult.data;
    const userId = req.user?.id;

    // Build where clause
    let whereClause = {};

    // If projectId is specified, check access and filter by it
    if (projectId) {
      const hasAccess = await checkProjectAccess(userId, projectId);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied to this project' });
      }
      whereClause.projectId = projectId;
    } else {
      // If no project specified, get tasks from all user's projects
      const userProjects = await prisma.project.findMany({
        where: {
          organization: {
            users: {
              some: {
                userId: userId,
              },
            },
          },
        },
        select: { id: true },
      });
      
      whereClause.projectId = {
        in: userProjects.map(p => p.id),
      };
    }

    // Add optional filters
    if (assigneeId) {
      whereClause.assigneeId = assigneeId;
    }

    if (completed !== undefined) {
      whereClause.completed = completed;
    }

    if (dueDate) {
      const dueDateFilter = getDueDateFilter(dueDate);
      if (dueDateFilter) {
        whereClause.dueDate = dueDateFilter;
      }
    }

    // Get total count for pagination
    const totalCount = await prisma.task.count({ where: whereClause });

    // Get paginated tasks
    const tasks = await prisma.task.findMany({
      where: whereClause,
      include: {
        project: {
          select: {
            id: true,
            name: true,
          },
        },
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        tags: {
          include: {
            tag: true,
          },
        },
      },
      orderBy: [
        { completed: 'asc' }, // Incomplete tasks first
        { dueDate: 'asc' },   // Earlier due date first
        { createdAt: 'desc' },  // Newest first
      ],
      skip: (page - 1) * limit,
      take: limit,
    });

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    res.json({
      tasks,
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
      error: 'Failed to fetch tasks',
      details: error.message 
    });
  }
});

// GET /tasks/:id - Get single task
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const taskId = parseInt(id);
    const userId = req.user?.id;

    if (isNaN(taskId)) {
      return res.status(400).json({ error: 'Invalid task ID' });
    }

    // Get task
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        project: {
          select: {
            id: true,
            name: true,
          },
        },
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        tags: {
          include: {
            tag: true,
          },
        },
        comments: {
          include: {
            user: {
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
      },
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Check if user has access to task's project
    const hasAccess = await checkProjectAccess(userId, task.projectId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this task' });
    }

    res.json(task);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch task',
      details: error.message 
    });
  }
});

// PUT /tasks/:id - Update task
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const taskId = parseInt(id);
    const userId = req.user?.id;

    if (isNaN(taskId)) {
      return res.status(400).json({ error: 'Invalid task ID' });
    }

    // Validate request body
    const validationResult = updateTaskSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Invalid request data',
        details: validationResult.error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      });
    }

    // Check if task exists and user has access
    const existingTask = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, projectId: true },
    });

    if (!existingTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const hasAccess = await checkProjectAccess(userId, existingTask.projectId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this task' });
    }

    // Update task
    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: {
        ...validationResult.data,
        dueDate: validationResult.data.dueDate ? new Date(validationResult.data.dueDate) : undefined,
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
          },
        },
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        tags: {
          include: {
            tag: true,
          },
        },
      },
    });

    res.json(updatedTask);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to update task',
      details: error.message 
    });
  }
});

// PATCH /tasks/:id/complete - Complete a task
router.patch('/:id/complete', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const taskId = parseInt(id);
    const userId = req.user?.id;

    if (isNaN(taskId)) {
      return res.status(400).json({ error: 'Invalid task ID' });
    }

    // Validate request body - only accept completed: true
    const validationResult = updateTaskStatusSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Invalid request data',
        details: validationResult.error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      });
    }

    const { completed } = validationResult.data;

    // Only allow completing tasks (completed: true)
    if (!completed) {
      return res.status(400).json({ 
        error: 'Invalid operation',
        details: 'This endpoint only allows completing tasks'
      });
    }

    // Check if task exists and user has access
    const existingTask = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, projectId: true, completed: true },
    });

    if (!existingTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const hasAccess = await checkProjectAccess(userId, existingTask.projectId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this task' });
    }

    // Check if task is already completed
    if (existingTask.completed) {
      return res.status(400).json({ 
        error: 'Task already completed',
        details: 'This task is already marked as completed'
      });
    }

    // Complete the task
    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: { completed: true },
      include: {
        project: {
          select: {
            id: true,
            name: true,
          },
        },
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    res.json({
      message: 'Task completed successfully',
      task: updatedTask,
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to update task status',
      details: error.message 
    });
  }
});

// DELETE /tasks/:id - Delete task
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const taskId = parseInt(id);
    const userId = req.user?.id;

    if (isNaN(taskId)) {
      return res.status(400).json({ error: 'Invalid task ID' });
    }

    // Check if task exists and user has access
    const existingTask = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, projectId: true },
    });

    if (!existingTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const hasAccess = await checkProjectAccess(userId, existingTask.projectId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this task' });
    }

    // Delete task (cascade will delete related comments and tag associations)
    await prisma.task.delete({
      where: { id: taskId },
    });

    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to delete task',
      details: error.message 
    });
  }
});

export default router;
