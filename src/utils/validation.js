import { z } from 'zod';

// Auth validation schemas
export const loginSchema = z.object({
  email: z.email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const signupSchema = z.object({
  email: z.email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters').optional(),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

// Organization validation schemas
export const createOrganizationSchema = z.object({
  name: z.string().min(2, 'Organization name must be at least 2 characters'),
  description: z.string().optional(),
});

export const inviteMemberSchema = z.object({
  email: z.string().email('Invalid email format'),
  roleName: z.string().min(2, 'Role name must be at least 2 characters').optional(),
});

// Project validation schemas
export const createProjectSchema = z.object({
  name: z.string().min(2, 'Project name must be at least 2 characters'),
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
  completed: z.boolean(),
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
