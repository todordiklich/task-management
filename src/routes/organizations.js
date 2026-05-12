import express from 'express';
import { randomBytes } from 'crypto';
import prisma from '../config/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { createOrganizationSchema, inviteMemberSchema } from '../utils/validation.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Organizations
 *   description: Organization and membership management
 */

// Generate invitation token
function generateInviteToken() {
  return randomBytes(32).toString('hex');
}

/**
 * @swagger
 * /organizations:
 *   post:
 *     summary: Create a new organization
 *     tags: [Organizations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 2
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Organization created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Organization'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         description: Unauthorized
 */
router.post('/', authenticate, async (req, res) => {
  try {
    // Validate request body
    const validationResult = createOrganizationSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Invalid request data',
        details: validationResult.error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      });
    }

    const { name, description } = validationResult.data;
    const userId = req.user.id;

    const adminRole = await prisma.organizationRole.findFirst({
      where: { name: 'admin' },
    });

    if (!adminRole) {
      return res.status(500).json({ error: 'Admin role not found' });
    }

    const organization = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({ data: { name, description } });
      await tx.userOrganization.create({
        data: { userId, organizationId: org.id, roleId: adminRole.id },
      });
      return org;
    });

    res.status(201).json({
      ...organization,
      user: await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, name: true },
      }),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create organization' });
  }
});

/**
 * @swagger
 * /organizations:
 *   get:
 *     summary: List organizations the current user belongs to
 *     tags: [Organizations]
 *     responses:
 *       200:
 *         description: List of organizations
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Organization'
 *       401:
 *         description: Unauthorized
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const { id: userId } = req.user;

    const userOrganizations = await prisma.userOrganization.findMany({
      where: {
        userId,
      },
      include: {
        organization: true,
        role: true,
        user: true,
      },
      orderBy: {
        organization: {
          createdAt: 'desc'
        }
      },
    });

    // Transform the data to return organizations format
    const organizations = userOrganizations.map(uo => ({
      ...uo.organization,
      userRole: uo.role,
      user: uo.user,
      membershipId: uo.id,
      joinedAt: uo.createdAt,
    }));

    res.json(organizations);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch organizations' });
  }
});

/**
 * @swagger
 * /organizations/{id}/invite:
 *   post:
 *     summary: Invite a user to an organization (admin only)
 *     tags: [Organizations]
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
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               roleName:
 *                 type: string
 *                 default: Member
 *     responses:
 *       201:
 *         description: Invitation sent
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       403:
 *         description: Only admins can invite members
 *       404:
 *         description: Organization or user not found
 *       409:
 *         description: User already a member or invitation already pending
 */
router.post('/:id/invite', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate request body
    const validationResult = inviteMemberSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Invalid request data',
        details: validationResult.error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      });
    }

    const { email, roleName = 'Member' } = validationResult.data;
    const inviterId = req.user.id;

    const organizationId = parseInt(id);
    if (isNaN(organizationId)) {
      return res.status(400).json({ error: 'Invalid organization ID' });
    }
    
    // Check if inviter is admin of the organization
    const inviterMembership = await prisma.userOrganization.findFirst({
      where: { userId: inviterId, organizationId, role: { name: 'admin' } },
    });

    if (!inviterMembership) {
      return res.status(403).json({ error: 'Only admins can invite members' });
    }

    // Check if organization exists
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    // Find user to invite
    const invitedUser = await prisma.user.findUnique({
      where: { email },
    });

    if (!invitedUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user is already a member
    const existingMembership = await prisma.userOrganization.findFirst({
      where: {
        userId: invitedUser.id,
        organizationId,
      },
    });

    if (existingMembership) {
      return res.status(409).json({ error: 'User is already a member' });
    }

    // Check if there's already a pending invitation
    const pendingInvitation = await prisma.invitation.findFirst({
      where: {
        email: invitedUser.email,
        organizationId,
        status: 'pending',
      },
    });

    if (pendingInvitation) {
      return res.status(409).json({ error: 'Invitation already sent' });
    }

    // Get role
    const role = await prisma.organizationRole.findUnique({
      where: { name: roleName },
    });

    if (!role) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Generate invitation token and expiration (7 days)
    const inviteToken = generateInviteToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Create invitation in Invitation table
    const invitation = await prisma.invitation.create({
      data: {
        token: inviteToken,
        email: invitedUser.email,
        organizationId,
        roleId: role.id,
        inviterId,
        status: 'pending',
        expiresAt,
      },
      include: {
        organization: true,
        role: true,
        inviter: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    res.status(201).json({
      message: 'Invitation sent successfully',
      invitation: {
        id: invitation.id,
        organization: invitation.organization,
        role: invitation.role,
        invitedUser: {
          id: invitedUser.id,
          email: invitedUser.email,
          name: invitedUser.name,
        },
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send invitation' });
  }
});

/**
 * @swagger
 * /organizations/accept-invitation:
 *   post:
 *     summary: Accept an organization invitation
 *     tags: [Organizations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Invitation accepted
 *       400:
 *         description: Missing token
 *       403:
 *         description: Invitation is for a different email
 *       404:
 *         description: Invalid or expired invitation
 */
router.post('/accept-invitation', authenticate, async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Invalid request data', details: [{ field: 'token', message: 'Token is required' }] });
    }

    const invitation = await prisma.invitation.findFirst({ where: { token } });

    if (!invitation || invitation.status !== 'pending' || invitation.expiresAt < new Date()) {
      return res.status(404).json({ error: 'Invalid or expired invitation' });
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { email: true },
    });

    if (currentUser?.email !== invitation.email) {
      return res.status(403).json({ error: 'This invitation is not for your email' });
    }

    const membership = await prisma.$transaction(async (tx) => {
      const newMembership = await tx.userOrganization.create({
        data: {
          userId: req.user.id,
          organizationId: invitation.organizationId,
          roleId: invitation.roleId,
        },
      });
      await tx.invitation.update({ where: { id: invitation.id }, data: { status: 'accepted' } });
      return newMembership;
    });

    res.json({ message: 'Invitation accepted successfully', membership });
  } catch (error) {
    res.status(500).json({ error: 'Failed to accept invitation' });
  }
});

/**
 * @swagger
 * /organizations/{id}/members:
 *   get:
 *     summary: List members of an organization
 *     tags: [Organizations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of members
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not a member of this organization
 *       404:
 *         description: Organization not found
 */
router.get('/:id/members', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { id: userId } = req.user;

    const organizationId = parseInt(id);
    if (isNaN(organizationId)) {
      return res.status(400).json({ error: 'Invalid organization ID' });
    }

    // Check if organization exists
    const org = await prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    // Check if user is a member
    const userMembership = await prisma.userOrganization.findFirst({
      where: { userId, organizationId },
    });

    if (!userMembership) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const members = await prisma.userOrganization.findMany({
      where: { organizationId },
      include: {
        user: { select: { id: true, email: true, name: true } },
        role: { select: { id: true, name: true } },
      },
    });

    res.json(members);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

export default router;