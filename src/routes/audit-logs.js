import express from 'express';
import { authenticate } from '../middleware/auth.js';
import prisma from '../config/prisma.js';
import { listAuditLogsSchema } from '../utils/validation.js';

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    // Validate query parameters
    const validationResult = listAuditLogsSchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Invalid query parameters',
        details: validationResult.error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      });
    }

    const { page, limit, userId, action, entityType, entityId, startDate, endDate } = validationResult.data;
    const currentUserId = req.user?.id;

    // Build where clause
    let whereClause = {};

    // If userId is specified, check if current user has access to that user's organizations
    if (userId) {
      const targetUser = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          organizations: {
            include: {
              organization: {
                select: { id: true }
              }
            }
          }
        }
      });

      if (!targetUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Check if current user has access to any of target user's organizations
      const targetOrgIds = targetUser.organizations.map(org => org.organization.id);
      const currentUserOrgs = await prisma.userOrganization.findMany({
        where: { userId: currentUserId },
        select: { organizationId: true }
      });

      const currentUserOrgIds = currentUserOrgs.map(org => org.organizationId);
      const hasSharedOrg = targetOrgIds.some(orgId => currentUserOrgIds.includes(orgId));

      if (!hasSharedOrg) {
        return res.status(403).json({ 
          error: 'Access denied',
          details: 'You do not have access to audit logs for this user'
        });
      }

      whereClause.userId = userId;
    } else {
      // If no userId specified, only show logs from current user's organizations
      const currentUserOrgs = await prisma.userOrganization.findMany({
        where: { userId: currentUserId },
        select: { organizationId: true }
      });

      whereClause.user = {
        organizations: {
          some: {
            organizationId: {
              in: currentUserOrgs.map(org => org.organizationId)
            }
          }
        }
      };
    }

    // Add optional filters
    if (action) {
      whereClause.action = action;
    }

    if (entityType) {
      whereClause.entityType = entityType;
    }

    if (entityId) {
      whereClause.entityId = entityId;
    }

    if (startDate) {
      whereClause.createdAt = {
        gte: new Date(startDate)
      };
    }

    if (endDate) {
      whereClause.createdAt = {
        ...whereClause.createdAt,
        lte: new Date(endDate)
      };
    }

    // Get total count for pagination
    const totalCount = await prisma.auditLog.count({ where: whereClause });

    // Get paginated audit logs
    const auditLogs = await prisma.auditLog.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: [
        { createdAt: 'desc' }, // Most recent first
      ],
      skip: (page - 1) * limit,
      take: limit,
    });

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    res.json({
      auditLogs,
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
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ 
      error: 'Failed to fetch audit logs',
      details: error.message 
    });
  }
});

export default router;
