import express from 'express';
import { randomBytes } from 'crypto';
import prisma from '../config/prisma.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Generate invitation token
function generateInviteToken() {
  return randomBytes(32).toString('hex');
}

// POST /organizations - Create new organization
router.post('/', authenticate, async (req, res) => {
  try {
    const { name, description } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User ID is required' });
    }

    if (!name) {
      return res.status(400).json({ error: 'Organization name is required' });
    }

    // Get admin role first (outside transaction for better error handling)
    const adminRole = await prisma.organizationRole.findFirst({
      where: { name: 'Admin' },
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
      },
      orderBy: {
        id: 'desc',
      },
    });

    // Transform the data to return organizations format
    const organizations = userOrganizations.map(uo => ({
      ...uo.organization,
      userRole: uo.role,
      membershipId: uo.id,
      joinedAt: uo.organization.createdAt, // Use organization's createdAt as join date
    }));

    res.json(organizations);
  } catch (error) {
    console.error('Error fetching organizations:', error);
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
    const { email, roleName = 'member' } = req.body;
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

    // Get role
    const role = await prisma.organizationRole.findUnique({
      where: { name: roleName },
    });

    if (!role) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Generate invitation token
    const inviteToken = generateInviteToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Create invitation
    const invitation = await prisma.userOrganization.create({
      data: {
        userId: invitedUser.id,
        organizationId,
        roleId: role.id,
        inviteToken,
        inviteExpiresAt: expiresAt,
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
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    res.status(201).json({
      message: 'Invitation sent successfully',
      invitation: {
        id: invitation.id,
        user: invitation.user,
        role: invitation.role,
        organization: invitation.organization,
        inviteToken,
        expiresAt,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send invitation' });
  }
});

// POST /organizations/accept/:token - Accept organization invitation
router.post('/accept/:token', async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({ error: 'Invitation token is required' });
    }

    // Find invitation
    const invitation = await prisma.userOrganization.findFirst({
      where: {
        inviteToken: token,
        joinedAt: null, // Not yet accepted
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
        role: true,
      },
    });

    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    // Check if invitation has expired
    if (invitation.inviteExpiresAt && invitation.inviteExpiresAt < new Date()) {
      // Delete expired invitation
      await prisma.userOrganization.delete({
        where: { id: invitation.id },
      });
      return res.status(410).json({ error: 'Invitation has expired' });
    }

    // Accept invitation
    const updatedMembership = await prisma.userOrganization.update({
      where: { id: invitation.id },
      data: {
        joinedAt: new Date(),
        inviteToken: null,
        inviteExpiresAt: null,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
        role: true,
      },
    });

    res.json({
      message: 'Invitation accepted successfully',
      membership: updatedMembership,
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
        joinedAt: { not: null }, // Only accepted members
      },
    });

    if (!userMembership) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get all members
    const members = await prisma.userOrganization.findMany({
      where: {
        organizationId,
        joinedAt: { not: null },
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
      },
      orderBy: {
        joinedAt: 'asc',
      },
    });

    res.json(members);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

export default router;
