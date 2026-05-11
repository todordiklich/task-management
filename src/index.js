import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import organizationRoutes from './routes/organizations.js';
import projectRoutes from './routes/projects.js';
import taskRoutes from './routes/tasks.js';
import commentRoutes from './routes/comments.js';
import tagRoutes from './routes/tags.js';
import auditLogRoutes from './routes/audit-logs.js';
import { requestLogger } from './utils/logger.js';
import { generalRateLimit, authRateLimit } from './middleware/rateLimit.js';

const app = express();

// CORS configuration
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.ALLOWED_ORIGINS?.split(',') || ['https://yourdomain.com']
    : ['http://localhost:3000', 'http://localhost:5173'], // Development origins
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200,
};

// Add middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(requestLogger);
app.use(generalRateLimit);

// Root route
app.get('/', (req, res) => {
  res.json({ 
    message: 'Task Management API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      auth: '/api/v1/auth',
      users: '/api/v1/users',
      organizations: '/api/v1/organizations',
      projects: '/api/v1/projects',
      tasks: '/api/v1/tasks',
      comments: '/api/v1/comments',
      tags: '/api/v1/tags',
      'audit-logs': '/api/v1/audit-logs'
    }
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount auth routes with stricter rate limiting
app.use('/api/v1/auth', authRateLimit, authRoutes);

// Mount users routes
app.use('/api/v1/users', userRoutes);

// Mount organization routes
app.use('/api/v1/organizations', organizationRoutes);

// Mount project routes
app.use('/api/v1/projects', projectRoutes);

// Mount task routes
app.use('/api/v1/tasks', taskRoutes);

// Mount comment routes
app.use('/api/v1/comments', commentRoutes);

// Mount tag routes
app.use('/api/v1/tags', tagRoutes);

// Mount audit log routes
app.use('/api/v1/audit-logs', auditLogRoutes);

// Start server
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
