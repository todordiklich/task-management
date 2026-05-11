# Task Management API

A comprehensive task management API with authentication and authorization features.

## Features

### Authentication & Authorization
- Email/password signup and login
- Password hashing with bcrypt (12 salt rounds)
- JWT access tokens (15-minute expiry)
- Refresh tokens with rotation (7-day expiry)
- Role-Based Access Control (RBAC)
- Account activation/deactivation

### Security Features
- Secure password hashing with bcrypt
- JWT token verification with type checking
- Refresh token rotation for enhanced security
- Input validation with Zod schemas
- Protected routes with middleware
- User activity tracking

## API Endpoints

### Authentication Routes (`/api/v1/auth`)
- `POST /signup` - Register new user
- `POST /login` - User login
- `POST /refresh` - Refresh access token
- `POST /logout` - User logout
- `GET /me` - Get current user profile

### User Routes (`/api/v1/users`)
- `GET /users/:id` - Get user details (admin only)
- `PATCH /users/:id` - Update user profile (admin or own profile)

### Health Check
- `GET /health` - Server health status

## Authentication Flow

### 1. User Registration
```bash
POST /api/v1/auth/signup
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!@#",
  "name": "John Doe"
}
```

### 2. User Login
```bash
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!@#"
}
```

### 3. Token Refresh
```bash
POST /api/v1/auth/refresh
Content-Type: application/json

{
  "refreshToken": "your-refresh-token-here"
}
```

### 4. Access Protected Routes
```bash
GET /api/v1/auth/me
Authorization: Bearer your-access-token-here
```

## Password Requirements

- Minimum 8 characters
- Maximum 128 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character

## Token Management

### Access Token
- **Type**: JWT
- **Expiry**: 15 minutes
- **Usage**: Bearer token in Authorization header

### Refresh Token
- **Type**: Random hex string
- **Expiry**: 7 days
- **Storage**: Database with automatic rotation
- **Usage**: Request body for token refresh

## Role-Based Access Control

### User Roles
- `user` - Standard user access
- `admin` - Administrative access

### Authorization Middleware
```javascript
// Require authentication
router.get('/protected', authenticate, handler);

// Require specific role
router.get('/admin-only', authenticate, authorize('admin'), handler);

// Optional authentication
router.get('/public', optionalAuth, handler);
```

## Database Schema

### Users Table
- `id` - Primary key
- `email` - Unique email address
- `name` - User display name
- `passwordHash` - Bcrypt hashed password
- `role` - User role (user/admin)
- `isActive` - Account status
- `createdAt` - Registration timestamp
- `updatedAt` - Last update timestamp

### Refresh Tokens Table
- `id` - Primary key
- `token` - Unique refresh token
- `userId` - Foreign key to users
- `expiresAt` - Token expiration
- `createdAt` - Creation timestamp

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://username:password@localhost:5432/database

# JWT Secrets
JWT_ACCESS_SECRET=your-super-secret-access-key-change-in-production
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-in-production

# Server
PORT=3000
NODE_ENV=development
```

## Security Best Practices

1. **Password Security**: Uses bcrypt with 12 salt rounds
2. **Token Security**: Short-lived access tokens with refresh token rotation
3. **Input Validation**: Comprehensive validation using Zod schemas
4. **Error Handling**: Consistent error responses without information leakage
5. **CORS**: Configure appropriately for production
6. **Rate Limiting**: Implement for production use

## Getting Started

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Setup Database**
   ```bash
   npm run db:push
   ```

3. **Set Environment Variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start Server**
   ```bash
   npm run dev
   ```

## Development

### Database Commands
- `npm run db:migrate` - Run database migrations
- `npm run db:push` - Push schema changes
- `npm run db:studio` - Open Prisma Studio
- `npm run db:seed` - Seed database with sample data

### Project Structure
```
src/
├── config/
│   ├── index.js      # Environment configuration
│   └── prisma.js      # Database client
├── middleware/
│   └── auth.js        # Authentication & authorization middleware
├── routes/
│   └── auth.js        # Authentication routes
├── utils/
│   ├── password.js    # Password hashing utilities
│   └── tokens.js      # JWT token utilities
│   └── validation     # Input validation schemas
└── index.js           # Main application entry
```

## Testing

The authentication system includes comprehensive testing for:
- User registration and login
- Token generation and refresh
- Protected route access
- Input validation
- Error handling

Run tests with:
```bash
npm test
```

## Production Considerations

1. **Environment Variables**: Use strong, unique secrets
2. **Database**: Use connection pooling and SSL
3. **Logging**: Implement structured logging
4. **Monitoring**: Add health checks and metrics
5. **Rate Limiting**: Protect against abuse
6. **HTTPS**: Always use HTTPS in production
