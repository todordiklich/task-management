import express from 'express';
import { hashPassword } from '../utils/password.js';
import prisma from '../config/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { updateUserSchema } from '../utils/validation.js';

const router = express.Router();

// GET /users/:id - Get user details (admin only or own profile)
router.get('/:id', authenticate, async (req, res) => {
  try {
    const targetId = parseInt(req.params.id);
    const currentUserId = req.user?.id;
    const currentUserRole = req.user?.role;

    if (isNaN(targetId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    // Users can only get their own profile unless they're admin
    if (currentUserRole !== 'admin' && currentUserId !== targetId) {
      return res.status(403).json({ error: 'Forbidden: Can only access own profile' });
    }

    const user = await prisma.user.findUnique({
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

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// PATCH /users/:id - Update user profile (admin or own profile)
router.patch('/:id', authenticate, async (req, res) => {
  try {
    const targetId = parseInt(req.params.id);
    const currentUserId = req.user?.id;
    const currentUserRole = req.user?.role;

    if (isNaN(targetId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    // Users can only update their own profile unless they're admin
    if (currentUserRole !== 'admin' && currentUserId !== targetId) {
      return res.status(403).json({ error: 'Forbidden: Can only update own profile' });
    }

    // Validate request body
    const validationResult = updateUserSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Invalid request data',
        details: validationResult.error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      });
    }

    const { email, name, password, role, isActive } = validationResult.data;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({ where: { id: targetId } });
    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prepare update data
    const updateData = {};
    
    if (email !== undefined) {
      // Check if email is already taken by another user
      const emailUser = await prisma.user.findUnique({ where: { email } });
      if (emailUser && emailUser.id !== targetId) {
        return res.status(409).json({ error: 'Email already exists' });
      }
      updateData.email = email;
    }
    
    if (name !== undefined) updateData.name = name;
    
    if (password !== undefined) {
      updateData.passwordHash = await hashPassword(password);
    }

    // Only admins can update role and isActive
    if (currentUserRole === 'admin') {
      if (role !== undefined) updateData.role = role;
      if (isActive !== undefined) updateData.isActive = isActive;
    }

    const updatedUser = await prisma.user.update({
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

    res.json(updatedUser);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

export default router;
