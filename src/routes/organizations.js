import express from 'express';
import { randomBytes } from 'crypto';
import prisma from '../config/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { createOrganizationSchema, inviteMemberSchema } from '../utils/validation.js';

const router = express.Router();

// Generate invitation token
function generateInviteToken() {
  return randomBytes(32).toString('hex');
}

// POST /organizations - Create new organization
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
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User ID is required' });
    }

    if (!name) {
      return res.status(400).json({ error: 'Organization name is required' });
    }

    // Get admin role first (outside transaction for better error handling)
    const adminRole = await prisma.organizationRole.findFirst({
      where: { name: 'admin' },
    });

    if (!adminRole) {
      return res.status(500).json({ error: 'Admin role not found' });
    }

    // Create organization and user-organization relationship in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create organization
      const organization = await tx.organization.create({
        data: {
          name,
          description,
        },
      });

      // Create user-organization relationship
      const userOrg = await tx.userOrganization.create({
        data: {
          userId,
          organizationId: organization.id,
          roleId: adminRole.id,
        },
      });

      return { organization, userOrg };
    });

    res.status(201).json({
      ...result.organization,
      user: await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, name: true }
      })
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create organization' });
  }
});

// GET /organizations - List user's organizations
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user?.id;
    
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
      user: uo.user, // Include user information with role
      membershipId: uo.id,
      joinedAt: uo.organization.createdAt, // Use organization's createdAt as join date
    }));

    res.json(organizations);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch organizations',
      details: error.message 
    });
  }
});

// POST /organizations/:id/invite - Invite member to organization
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
    const inviterId = req.user?.id;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const organizationId = parseInt(id);
    if (isNaN(organizationId)) {
      return res.status(400).json({ error: 'Invalid organization ID' });
    }
    
    // Check if inviter is admin of the organization
    const inviterMembership = await prisma.userOrganization.findFirst({
      where: {
        userId: inviterId,
        organizationId,
        role: {
          name: 'admin',
        },
      },
      include: {
        role: true,
      },
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
        inviterId: inviterId,
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
        token: invitation.token,
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

// POST /organizations/accept/:token - Accept organization invitation
router.post('/accept/:token', authenticate, async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({ error: 'Invitation token is required' });
    }

    // Find invitation by token
    const invitation = await prisma.invitation.findFirst({
      where: {
        token,
        status: 'pending',
        expiresAt: {
          gte: new Date(), // Check if invitation hasn't expired
        },
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

    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found or expired' });
    }

    // Verify that current user is the invited user
    const currentUser = await prisma.user.findUnique({
      where: { id: req.user?.id },
      select: { email: true },
    });

    if (currentUser?.email !== invitation.email) {
      return res.status(403).json({ error: 'This invitation is not for you' });
    }

    // Check if user is already a member
    const existingMembership = await prisma.userOrganization.findFirst({
      where: {
        userId: req.user?.id,
        organizationId: invitation.organizationId,
      },
    });

    if (existingMembership) {
      return res.status(409).json({ error: 'You are already a member of this organization' });
    }

    // Create userOrganization entry (actual membership)
    const membership = await prisma.userOrganization.create({
      data: {
        userId: req.user?.id,
        organizationId: invitation.organizationId,
        roleId: invitation.roleId,
      },
      include: {
        user: true,
        organization: true,
        role: true,
      },
    });

    // Update invitation status to accepted
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: {
        status: 'accepted',
      },
    });

    res.json({
      message: 'Invitation accepted successfully',
      membership: membership,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to accept invitation' });
  }
});

// GET /organizations/:id/members - List organization members
router.get('/:id/members', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const organizationId = parseInt(id);
    if (isNaN(organizationId)) {
      return res.status(400).json({ error: 'Invalid organization ID' });
    }

    // Check if user is a member
    const userMembership = await prisma.userOrganization.findFirst({
      where: {
        userId,
        organizationId,
      },
    });

    if (!userMembership) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get all members
    const members = await prisma.userOrganization.findMany({
      where: {
        organizationId,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
        role: true,
      }
    });

    res.json(members);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

export default router;