import { jest } from '@jest/globals';
import {
  loginSchema,
  signupSchema,
  refreshTokenSchema,
  createOrganizationSchema,
  inviteMemberSchema,
  createProjectSchema,
  updateProjectSchema,
  listProjectsSchema,
  createTaskSchema,
  updateTaskSchema,
  updateTaskStatusSchema,
  listTasksSchema,
  createCommentSchema,
  updateCommentSchema,
  createTagSchema,
  listTagsSchema,
  attachTagSchema,
  listAuditLogsSchema,
  updateUserSchema,
} from '../src/utils/validation.js';

describe('Validation Schemas', () => {
  describe('Auth Schemas', () => {
    describe('loginSchema', () => {
      it('should validate correct login data', () => {
        const data = { email: 'test@example.com', password: 'password123' };
        const result = loginSchema.safeParse(data);
        
        expect(result.success).toBe(true);
        expect(result.data).toEqual(data);
      });

      it('should reject invalid email formats', () => {
        const invalidEmails = [
          'invalid',
          'test@',
          '@example.com',
          'test.example.com',
          'test@.com',
        ];

        invalidEmails.forEach(email => {
          const data = { email, password: 'password123' };
          const result = loginSchema.safeParse(data);
          
          expect(result.success).toBe(false);
          expect(result.error.issues.some(issue => issue.message.includes('email'))).toBe(true);
        });
      });

      it('should reject passwords that are too short', () => {
        const data = { email: 'test@example.com', password: '123' };
        const result = loginSchema.safeParse(data);
        
        expect(result.success).toBe(false);
        expect(result.error.issues[0].message).toContain('6 characters');
      });

      it('should reject missing fields', () => {
        const testCases = [
          { password: 'password123' }, // missing email
          { email: 'test@example.com' }, // missing password
          {}, // missing both
        ];

        testCases.forEach(data => {
          const result = loginSchema.safeParse(data);
          expect(result.success).toBe(false);
        });
      });
    });

    describe('signupSchema', () => {
      it('should validate correct signup data', () => {
        const data = { email: 'test@example.com', password: 'password123', name: 'Test User' };
        const result = signupSchema.safeParse(data);
        
        expect(result.success).toBe(true);
        expect(result.data).toEqual(data);
      });

      it('should accept signup without optional name', () => {
        const data = { email: 'test@example.com', password: 'password123' };
        const result = signupSchema.safeParse(data);
        
        expect(result.success).toBe(true);
        expect(result.data.name).toBeUndefined();
      });

      it('should reject names that are too short', () => {
        const data = { email: 'test@example.com', password: 'password123', name: 'a' };
        const result = signupSchema.safeParse(data);
        
        expect(result.success).toBe(false);
        expect(result.error.issues[0].message).toContain('2 characters');
      });
    });

    describe('refreshTokenSchema', () => {
      it('should validate correct refresh token', () => {
        const data = { refreshToken: 'valid-refresh-token-123' };
        const result = refreshTokenSchema.safeParse(data);
        
        expect(result.success).toBe(true);
        expect(result.data).toEqual(data);
      });

      it('should reject empty refresh token', () => {
        const data = { refreshToken: '' };
        const result = refreshTokenSchema.safeParse(data);
        
        expect(result.success).toBe(false);
        expect(result.error.issues[0].message).toContain('required');
      });
    });
  });

  describe('Organization Schemas', () => {
    describe('createOrganizationSchema', () => {
      it('should validate correct organization data', () => {
        const data = { name: 'Test Organization', description: 'Test description' };
        const result = createOrganizationSchema.safeParse(data);
        
        expect(result.success).toBe(true);
        expect(result.data).toEqual(data);
      });

      it('should accept organization without description', () => {
        const data = { name: 'Test Organization' };
        const result = createOrganizationSchema.safeParse(data);
        
        expect(result.success).toBe(true);
        expect(result.data.description).toBeUndefined();
      });

      it('should reject organization name that is too short', () => {
        const data = { name: 'a' };
        const result = createOrganizationSchema.safeParse(data);
        
        expect(result.success).toBe(false);
        expect(result.error.issues[0].message).toContain('2 characters');
      });
    });

    describe('inviteMemberSchema', () => {
      it('should validate correct invitation data', () => {
        const data = { email: 'member@example.com', roleName: 'Developer' };
        const result = inviteMemberSchema.safeParse(data);
        
        expect(result.success).toBe(true);
        expect(result.data).toEqual(data);
      });

      it('should accept invitation without role name', () => {
        const data = { email: 'member@example.com' };
        const result = inviteMemberSchema.safeParse(data);
        
        expect(result.success).toBe(true);
        expect(result.data.roleName).toBeUndefined();
      });

      it('should reject invalid email in invitation', () => {
        const data = { email: 'invalid-email' };
        const result = inviteMemberSchema.safeParse(data);
        
        expect(result.success).toBe(false);
        expect(result.error.issues[0].message).toContain('email');
      });
    });
  });

  describe('Project Schemas', () => {
    describe('createProjectSchema', () => {
      it('should validate correct project data', () => {
        const data = { name: 'Test Project', description: 'Test description', organizationId: 1 };
        const result = createProjectSchema.safeParse(data);
        
        expect(result.success).toBe(true);
        expect(result.data).toEqual(data);
      });

      it('should reject negative organization ID', () => {
        const data = { name: 'Test Project', organizationId: -1 };
        const result = createProjectSchema.safeParse(data);
        
        expect(result.success).toBe(false);
        expect(result.error.issues[0].message).toContain('positive');
      });

      it('should reject project name that is too short', () => {
        const data = { name: 'a', organizationId: 1 };
        const result = createProjectSchema.safeParse(data);
        
        expect(result.success).toBe(false);
        expect(result.error.issues[0].message).toContain('2 characters');
      });
    });

    describe('listProjectsSchema', () => {
      it('should use default values for pagination', () => {
        const data = {};
        const result = listProjectsSchema.safeParse(data);
        
        expect(result.success).toBe(true);
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(10);
      });

      it('should validate custom pagination values', () => {
        const data = { page: 2, limit: 20, organizationId: 1 };
        const result = listProjectsSchema.safeParse(data);
        
        expect(result.success).toBe(true);
        expect(result.data.page).toBe(2);
        expect(result.data.limit).toBe(20);
        expect(result.data.organizationId).toBe(1);
      });

      it('should coerce string numbers to integers', () => {
        const data = { page: '2', limit: '20' };
        const result = listProjectsSchema.safeParse(data);
        
        expect(result.success).toBe(true);
        expect(typeof result.data.page).toBe('number');
        expect(typeof result.data.limit).toBe('number');
      });

      it('should reject limit over 100', () => {
        const data = { limit: 150 };
        const result = listProjectsSchema.safeParse(data);
        
        expect(result.success).toBe(false);
        expect(result.error.issues[0].message).toContain('100');
      });
    });
  });

  describe('Task Schemas', () => {
    describe('createTaskSchema', () => {
      it('should validate correct task data', () => {
        const data = {
          title: 'Test Task',
          description: 'Test description',
          projectId: 1,
          assigneeId: 2,
          dueDate: '2024-12-31T23:59:59.000Z',
          completed: false
        };
        const result = createTaskSchema.safeParse(data);
        
        expect(result.success).toBe(true);
        expect(result.data).toEqual(data);
      });

      it('should accept task with minimal required fields', () => {
        const data = {
          title: 'Test Task',
          projectId: 1
        };
        const result = createTaskSchema.safeParse(data);
        
        expect(result.success).toBe(true);
        expect(result.data.completed).toBe(false);
      });

      it('should reject invalid datetime format', () => {
        const data = {
          title: 'Test Task',
          projectId: 1,
          dueDate: 'invalid-date'
        };
        const result = createTaskSchema.safeParse(data);
        
        expect(result.success).toBe(false);
        expect(result.error.issues[0].message).toContain('datetime');
      });
    });

    describe('updateTaskStatusSchema', () => {
      it('should validate task status update', () => {
        const data = { completed: true };
        const result = updateTaskStatusSchema.safeParse(data);
        
        expect(result.success).toBe(true);
        expect(result.data.completed).toBe(true);
      });

      it('should reject non-boolean completed value', () => {
        const data = { completed: 'true' };
        const result = updateTaskStatusSchema.safeParse(data);
        
        expect(result.success).toBe(false);
      });
    });

    describe('listTasksSchema', () => {
      it('should accept valid due date filters', () => {
        const validFilters = ['overdue', 'due_today', 'due_soon', 'due_later'];
        
        validFilters.forEach(filter => {
          const data = { dueDate: filter };
          const result = listTasksSchema.safeParse(data);
          
          expect(result.success).toBe(true);
          expect(result.data.dueDate).toBe(filter);
        });
      });

      it('should reject invalid due date filter', () => {
        const data = { dueDate: 'invalid_filter' };
        const result = listTasksSchema.safeParse(data);
        
        expect(result.success).toBe(false);
        expect(result.error.issues[0].message).toContain('Invalid');
      });
    });
  });

  describe('Comment Schemas', () => {
    describe('createCommentSchema', () => {
      it('should validate correct comment data', () => {
        const data = { content: 'This is a comment', taskId: 1 };
        const result = createCommentSchema.safeParse(data);
        
        expect(result.success).toBe(true);
        expect(result.data).toEqual(data);
      });

      it('should reject empty comment content', () => {
        const data = { content: '', taskId: 1 };
        const result = createCommentSchema.safeParse(data);
        
        expect(result.success).toBe(false);
        expect(result.error.issues[0].message).toContain('empty');
      });

      it('should reject comment that is too long', () => {
        const data = { content: 'a'.repeat(1001), taskId: 1 };
        const result = createCommentSchema.safeParse(data);
        
        expect(result.success).toBe(false);
        expect(result.error.issues[0].message).toContain('too long');
      });
    });
  });

  describe('Tag Schemas', () => {
    describe('createTagSchema', () => {
      it('should validate correct tag data', () => {
        const data = { name: 'urgent', color: '#FF0000' };
        const result = createTagSchema.safeParse(data);
        
        expect(result.success).toBe(true);
        expect(result.data).toEqual(data);
      });

      it('should accept tag without color', () => {
        const data = { name: 'urgent' };
        const result = createTagSchema.safeParse(data);
        
        expect(result.success).toBe(true);
        expect(result.data.color).toBeUndefined();
      });

      it('should reject invalid hex color format', () => {
        const invalidColors = ['#FF0', 'FF0000', '#GGGGGG', '#FF000'];
        
        invalidColors.forEach(color => {
          const data = { name: 'urgent', color };
          const result = createTagSchema.safeParse(data);
          
          expect(result.success).toBe(false);
          expect(result.error.issues[0].message).toContain('color');
        });
      });
    });
  });

  describe('User Schemas', () => {
    describe('updateUserSchema', () => {
      it('should validate correct user update data', () => {
        const data = {
          email: 'newemail@example.com',
          name: 'New Name',
          password: 'newpassword123',
          role: 'admin',
          isActive: true
        };
        const result = updateUserSchema.safeParse(data);
        
        expect(result.success).toBe(true);
        expect(result.data).toEqual(data);
      });

      it('should accept partial update data', () => {
        const data = { name: 'New Name' };
        const result = updateUserSchema.safeParse(data);
        
        expect(result.success).toBe(true);
        expect(result.data.name).toBe('New Name');
        expect(result.data.email).toBeUndefined();
      });

      it('should reject invalid role', () => {
        const data = { role: 'invalid_role' };
        const result = updateUserSchema.safeParse(data);
        
        expect(result.success).toBe(false);
        expect(result.error.issues[0].message).toContain('Invalid');
      });

      it('should reject invalid email format', () => {
        const data = { email: 'invalid-email' };
        const result = updateUserSchema.safeParse(data);
        
        expect(result.success).toBe(false);
        expect(result.error.issues[0].message).toContain('email');
      });
    });
  });

  describe('Audit Log Schemas', () => {
    describe('listAuditLogsSchema', () => {
      it('should validate correct audit log query', () => {
        const data = {
          page: 1,
          limit: 50,
          userId: 1,
          action: 'create',
          entityType: 'task',
          entityId: 123,
          startDate: '2024-01-01T00:00:00.000Z',
          endDate: '2024-12-31T23:59:59.000Z'
        };
        const result = listAuditLogsSchema.safeParse(data);
        
        expect(result.success).toBe(true);
        expect(result.data).toEqual(data);
      });

      it('should accept valid action types', () => {
        const validActions = ['create', 'update', 'delete', 'login', 'logout'];
        
        validActions.forEach(action => {
          const data = { action };
          const result = listAuditLogsSchema.safeParse(data);
          
          expect(result.success).toBe(true);
          expect(result.data.action).toBe(action);
        });
      });

      it('should accept valid entity types', () => {
        const validEntities = ['user', 'organization', 'project', 'task', 'comment', 'tag'];
        
        validEntities.forEach(entity => {
          const data = { entityType: entity };
          const result = listAuditLogsSchema.safeParse(data);
          
          expect(result.success).toBe(true);
          expect(result.data.entityType).toBe(entity);
        });
      });

      it('should reject invalid datetime format', () => {
        const data = { startDate: 'invalid-date' };
        const result = listAuditLogsSchema.safeParse(data);

        expect(result.success).toBe(false);
        expect(result.error.issues[0].message).toContain('Invalid start date format');
      });
    });
  });

  describe('Schema Edge Cases', () => {
    it('should handle null values appropriately', () => {
      const testCases = [
        { schema: loginSchema, data: { email: null, password: 'test' }, shouldFail: true },
        { schema: createTaskSchema, data: { title: null, projectId: 1 }, shouldFail: true },
        { schema: updateUserSchema, data: { email: null }, shouldFail: true },
      ];

      testCases.forEach(({ schema, data, shouldFail }) => {
        const result = schema.safeParse(data);
        expect(result.success).toBe(!shouldFail);
      });
    });

    it('should handle undefined values appropriately', () => {
      const data = { email: undefined, password: 'test123' };
      const result = loginSchema.safeParse(data);
      
      expect(result.success).toBe(false);
    });

    it('should handle empty strings appropriately', () => {
      const testCases = [
        { schema: createTaskSchema, data: { title: '', projectId: 1 }, shouldFail: true },
        { schema: createCommentSchema, data: { content: '', taskId: 1 }, shouldFail: true },
        { schema: createTagSchema, data: { name: '', taskId: 1 }, shouldFail: true },
      ];

      testCases.forEach(({ schema, data, shouldFail }) => {
        const result = schema.safeParse(data);
        expect(result.success).toBe(!shouldFail);
      });
    });
  });
});
