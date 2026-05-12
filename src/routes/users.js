import express from 'express';
import { hashPassword } from '../utils/password.js';
import prisma from '../config/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { updateUserSchema } from '../utils/validation.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User profile management
 */

/**
 * @swagger
 * /users/{id}:
 *   get:
 *     summary: Get a user profile (own profile or admin only)
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: User profile
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: User not found
 */
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

/**
 * @swagger
 * /users/{id}:
 *   patch:
 *     summary: Update a user profile (own profile or admin only)
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               name:
 *                 type: string
 *               password:
 *                 type: string
 *                 minLength: 6
 *               role:
 *                 type: string
 *                 enum: [user, admin]
 *                 description: Admin only
 *               isActive:
 *                 type: boolean
 *                 description: Admin only
 *     responses:
 *       200:
 *         description: Updated user
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: User not found
 *       409:
 *         description: Email already taken
 */
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

    if (email === undefined && name === undefined && password === undefined && role === undefined && isActive === undefined) {
      return res.status(400).json({ error: 'Invalid request data', details: [{ field: '', message: 'At least one field is required' }] });
    }

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
