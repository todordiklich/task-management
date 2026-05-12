import { z } from 'zod';

// Auth validation schemas
export const loginSchema = z.object({
  email: z.email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(500, 'Password too long'),
});

export const signupSchema = z.object({
  email: z.email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(500, 'Password too long'),
  name: z.string().min(2, 'Name must be at least 2 characters').optional(),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

// Organization validation schemas
export const createOrganizationSchema = z.object({
  name: z.string().min(2, 'Organization name must be at least 2 characters').max(255, 'Organization name too long'),
  description: z.string().optional(),
});

export const inviteMemberSchema = z.object({
  email: z.email('Invalid email format'),
  roleName: z.string().min(2, 'Role name must be at least 2 characters').optional(),
});

// Project validation schemas
export const createProjectSchema = z.object({
  name: z.string().min(2, 'Project name must be at least 2 characters').max(255, 'Project name too long'),
  description: z.string().optional(),
  organizationId: z.number().positive('Organization ID must be positive'),
});

export const updateProjectSchema = z.object({
  name: z.string().min(2, 'Project name must be at least 2 characters').optional(),
  description: z.string().optional(),
});

export const listProjectsSchema = z.object({
  page: z.coerce.number().positive('Page must be positive').default(1),
  limit: z.coerce.number().positive('Limit must be positive').max(100).default(10),
  organizationId: z.coerce.number().positive('Organization ID must be positive').optional(),
});

// Task validation schemas
export const createTaskSchema = z.object({
  title: z.string().min(2, 'Task title must be at least 2 characters'),
  description: z.string().optional(),
  projectId: z.number().positive('Project ID must be positive'),
  assigneeId: z.number().positive('Assignee ID must be positive').optional(),
  dueDate: z.iso.datetime({ message: 'Invalid datetime format' }).optional(),
  completed: z.boolean().default(false),
});

export const updateTaskSchema = z.object({
  title: z.string().min(2, 'Task title must be at least 2 characters').optional(),
  description: z.string().optional(),
  assigneeId: z.number().positive('Assignee ID must be positive').optional(),
  dueDate: z.iso.datetime({ message: 'Invalid datetime format' }).optional(),
  completed: z.boolean().optional(),
});

export const updateTaskStatusSchema = z.object({
  completed: z.boolean(),
});

export const listTasksSchema = z.object({
  page: z.coerce.number().positive('Page must be positive').default(1),
  limit: z.coerce.number().positive('Limit must be positive').max(100).default(10),
  projectId: z.coerce.number().positive('Project ID must be positive').optional(),
  assigneeId: z.coerce.number().positive('Assignee ID must be positive').optional(),
  completed: z.boolean().optional(),
  dueDate: z.enum(['overdue', 'due_today', 'due_soon', 'due_later']).optional(),
});

// Comment validation schemas
export const createCommentSchema = z.object({
  content: z.string().min(1, 'Comment content cannot be empty').max(1000, 'Comment too long'),
  taskId: z.number().positive('Task ID must be positive'),
});

export const updateCommentSchema = z.object({
  content: z.string().min(1, 'Comment content cannot be empty').max(1000, 'Comment too long'),
});

// Tag validation schemas
export const createTagSchema = z.object({
  name: z.string().min(1, 'Tag name cannot be empty').max(50, 'Tag name too long'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid color format. Use hex color like #FF0000').optional(),
});

export const listTagsSchema = z.object({
  page: z.coerce.number().positive('Page must be positive').default(1),
  limit: z.coerce.number().positive('Limit must be positive').max(100).default(50),
  name: z.string().optional(),
});

export const attachTagSchema = z.object({
  tagId: z.number().positive('Tag ID must be positive'),
});

// User validation schemas
export const updateUserSchema = z.object({
  email: z.email('Invalid email format').optional(),
  name: z.string().min(2, 'Name must be at least 2 characters').max(255, 'Name too long').optional(),
  password: z.string().min(6, 'Password must be at least 6 characters').optional(),
  role: z.enum(['user', 'admin']).optional(),
  isActive: z.boolean().optional(),
});

// Audit log validation schemas
export const listAuditLogsSchema = z.object({
  page: z.coerce.number().positive('Page must be positive').default(1),
  limit: z.coerce.number().positive('Limit must be positive').max(100).default(50),
  userId: z.coerce.number().positive('User ID must be positive').optional(),
  action: z.enum(['create', 'update', 'delete', 'login', 'logout']).optional(),
  entityType: z.enum(['user', 'organization', 'project', 'task', 'comment', 'tag']).optional(),
  entityId: z.coerce.number().positive('Entity ID must be positive').optional(),
  startDate: z.iso.datetime({ message: 'Invalid start date format' }).optional(),
  endDate: z.iso.datetime({ message: 'Invalid end date format' }).optional(),
});
