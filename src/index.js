import 'dotenv/config';
import express from 'express';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import organizationRoutes from './routes/organizations.js';
import projectRoutes from './routes/projects.js';

const app = express();

// Add express.json() middleware first
app.use(express.json());

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
      projects: '/api/v1/projects'
    }
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount auth routes
app.use('/api/v1/auth', authRoutes);

// Mount users routes
app.use('/api/v1/users', userRoutes);

// Mount organization routes
app.use('/api/v1/organizations', organizationRoutes);

// Mount project routes
app.use('/api/v1/projects', projectRoutes);

// Start server
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
