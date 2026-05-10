import express from 'express';
import prisma from '../config/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { createCommentSchema, updateCommentSchema } from '../utils/validation.js';

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

// POST /comments - Create new comment
router.post('/', authenticate, async (req, res) => {
  try {
    // Validate request body
    const validationResult = createCommentSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Invalid request data',
        details: validationResult.error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      });
    }

    const { content, taskId } = validationResult.data;
    const userId = req.user?.id;

    // Check if user has access to task
    const hasAccess = await checkTaskAccess(userId, taskId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this task' });
    }

    // Check if task exists
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true },
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Create comment
    const comment = await prisma.comment.create({
      data: {
        content,
        taskId,
        userId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        task: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    res.status(201).json(comment);
  } catch (error) {
    console.error('Error creating comment:', error);
    res.status(500).json({ 
      error: 'Failed to create comment',
      details: error.message 
    });
  }
});

// DELETE /comments/:id - Delete comment
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const commentId = parseInt(id);
    const userId = req.user?.id;

    if (isNaN(commentId)) {
      return res.status(400).json({ error: 'Invalid comment ID' });
    }

    // Check if comment exists and get its details
    const existingComment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { 
        id: true, 
        userId: true, 
        taskId: true,
        task: {
          select: {
            projectId: true,
          },
        },
      },
    });

    if (!existingComment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    // Check if user has access to task
    const hasAccess = await checkTaskAccess(userId, existingComment.taskId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this task' });
    }

    // Check if user is the comment author or has project access
    const isAuthor = existingComment.userId === userId;
    
    if (!isAuthor) {
      // If not author, check if user has project-level permissions
      const projectAccess = await prisma.project.findFirst({
        where: {
          id: existingComment.task.projectId,
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

      if (!projectAccess) {
        return res.status(403).json({ error: 'Access denied to delete this comment' });
      }
    }

    // Delete comment
    await prisma.comment.delete({
      where: { id: commentId },
    });

    res.json({ message: 'Comment deleted successfully' });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ 
      error: 'Failed to delete comment',
      details: error.message 
    });
  }
});

export default router;
