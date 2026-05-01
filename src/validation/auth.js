import { z } from 'zod';

// Email validation regex
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Password requirements
const passwordMinLength = 8;
const passwordMaxLength = 128;

// Signup validation schema
export const signupSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Invalid email format')
    .regex(emailRegex, 'Invalid email format'),
  password: z
    .string()
    .min(passwordMinLength, `Password must be at least ${passwordMinLength} characters`)
    .max(passwordMaxLength, `Password must be less than ${passwordMaxLength} characters`)
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
  name: z
    .string()
    .min(1, 'Name is required')
    .max(100, 'Name must be less than 100 characters')
    .trim(),
});

// Login validation schema
export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Invalid email format')
    .regex(emailRegex, 'Invalid email format'),
  password: z
    .string()
    .min(1, 'Password is required'),
});

// Refresh token validation schema
export const refreshTokenSchema = z.object({
  refreshToken: z
    .string()
    .min(1, 'Refresh token is required'),
});

// Logout validation schema (optional refresh token)
export const logoutSchema = z.object({
  refreshToken: z
    .string()
    .optional(),
});

// User update validation schema
export const userUpdateSchema = z.object({
  email: z
    .string()
    .email('Invalid email format')
    .regex(emailRegex, 'Invalid email format')
    .optional(),
  name: z
    .string()
    .min(1, 'Name must be at least 1 character')
    .max(100, 'Name must be less than 100 characters')
    .trim()
    .optional(),
  password: z
    .string()
    .min(passwordMinLength, `Password must be at least ${passwordMinLength} characters`)
    .max(passwordMaxLength, `Password must be less than ${passwordMaxLength} characters`)
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character')
    .optional(),
}).refine((data) => {
  // At least one field must be provided for update
  return data.email !== undefined || data.name !== undefined || data.password !== undefined;
}, {
  message: 'At least one field must be provided for update',
  path: ['root'],
});

// Middleware for validation
export const validate = (schema) => {
  return (req, res, next) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error.errors) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        });
      }
      return res.status(400).json({
        error: 'Validation failed',
        message: error.message,
      });
    }
  };
};
