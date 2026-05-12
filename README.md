# Task Management API

A REST API for managing tasks, projects, and organizations, with JWT authentication and role-based access control.

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL

### Installation

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment variables**

   ```bash
   cp .env.example .env
   # Edit .env with your values
   ```

3. **Set up the database**

   ```bash
   npm run db:push
   ```

4. **Start the server**
   ```bash
   npm run dev
   ```

The server starts at `http://localhost:3000`.

---

## API Documentation (Swagger)

Interactive documentation is available while the server is running:

`http://localhost:3000/api-docs` | Swagger UI — browse and test every endpoint
`http://localhost:3000/api-docs.json` | Raw OpenAPI 3.0 spec (JSON)

### Authenticating in Swagger UI

1. Call `POST /auth/signup` or `POST /auth/login` to get an `accessToken`.
2. Click the **Authorize** button (🔒) at the top of the page.
3. Enter `Bearer <your-access-token>` and click **Authorize**.
4. All subsequent requests will include the token automatically.

---

## API Endpoints

Base path: `/api/v1`

### Auth — `/auth`

| Method | Path            | Description                                | Auth required |
| ------ | --------------- | ------------------------------------------ | ------------- |
| POST   | `/auth/signup`  | Register a new user                        | No            |
| POST   | `/auth/login`   | Log in, receive access + refresh tokens    | No            |
| POST   | `/auth/refresh` | Rotate refresh token, get new access token | No            |
| POST   | `/auth/logout`  | Invalidate all refresh tokens              | Yes           |

### Users — `/users`

| Method | Path         | Description                               |
| ------ | ------------ | ----------------------------------------- |
| GET    | `/users/:id` | Get a user profile (own or admin only)    |
| PATCH  | `/users/:id` | Update a user profile (own or admin only) |

### Organizations — `/organizations`

| Method | Path                               | Description                      |
| ------ | ---------------------------------- | -------------------------------- |
| POST   | `/organizations`                   | Create an organization           |
| GET    | `/organizations`                   | List organizations you belong to |
| POST   | `/organizations/:id/invite`        | Invite a user (admin only)       |
| POST   | `/organizations/accept-invitation` | Accept an invitation             |
| GET    | `/organizations/:id/members`       | List organization members        |

### Projects — `/projects`

| Method | Path            | Description               |
| ------ | --------------- | ------------------------- |
| POST   | `/projects`     | Create a project          |
| GET    | `/projects`     | List projects (paginated) |
| GET    | `/projects/:id` | Get a project             |
| PATCH  | `/projects/:id` | Update a project          |
| DELETE | `/projects/:id` | Delete a project          |

### Tasks — `/tasks`

| Method | Path         | Description                        |
| ------ | ------------ | ---------------------------------- |
| POST   | `/tasks`     | Create a task                      |
| GET    | `/tasks`     | List tasks (paginated, filterable) |
| GET    | `/tasks/:id` | Get a task                         |
| PATCH  | `/tasks/:id` | Update a task                      |
| DELETE | `/tasks/:id` | Delete a task                      |

### Comments — `/comments`

| Method | Path            | Description             |
| ------ | --------------- | ----------------------- |
| POST   | `/comments`     | Add a comment to a task |
| GET    | `/comments`     | List comments           |
| PATCH  | `/comments/:id` | Update a comment        |
| DELETE | `/comments/:id` | Delete a comment        |

### Tags — `/tags`

| Method | Path               | Description            |
| ------ | ------------------ | ---------------------- |
| POST   | `/tags`            | Create a tag           |
| GET    | `/tags`            | List tags              |
| DELETE | `/tags/:id`        | Delete a tag           |
| POST   | `/tags/:id/attach` | Attach a tag to a task |

### Audit Logs — `/audit-logs`

| Method | Path          | Description                             |
| ------ | ------------- | --------------------------------------- |
| GET    | `/audit-logs` | List audit logs (paginated, filterable) |

---

## Authentication

All protected endpoints require a JWT access token in the `Authorization` header:

```
Authorization: Bearer <access-token>
```

### Token Lifetimes

| Token         | Type       | Expiry     |
| ------------- | ---------- | ---------- |
| Access token  | JWT        | 15 minutes |
| Refresh token | Random hex | 7 days     |

### Example flow

**Sign up**

```bash
curl -X POST http://localhost:3000/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "secret123", "name": "Jane"}'
```

**Log in**

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "secret123"}'
# → { accessToken, refreshToken, user }
```

**Call a protected endpoint**

```bash
curl http://localhost:3000/api/v1/organizations \
  -H "Authorization: Bearer <accessToken>"
```

**Refresh an expired access token**

```bash
curl -X POST http://localhost:3000/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "<refreshToken>"}'
```

---

## Role-Based Access Control

| Role    | Capabilities                                                               |
| ------- | -------------------------------------------------------------------------- |
| `user`  | Manage own profile, create and access resources within their organizations |
| `admin` | All user capabilities plus update any user's role and active status        |

```javascript
router.get('/protected', authenticate, handler); // any logged-in user
router.get('/admin-only', authenticate, authorize('admin'), handler); // admins only
```

---

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/taskdb

# JWT
JWT_ACCESS_SECRET=change-me-in-production
JWT_REFRESH_SECRET=change-me-in-production
JWT_ACCESS_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d

# Server
PORT=3000
NODE_ENV=development
```

---

## Development

### Commands

```bash
npm run dev          # Start server
npm test             # Run test suite (273 tests)
npm run db:migrate   # Run database migrations
npm run db:push      # Push schema changes
npm run db:studio    # Open Prisma Studio
npm run db:seed      # Seed sample data
```

### Project Structure

```
src/
├── config/
│   ├── index.js        # Environment config + validation
│   ├── prisma.js       # Database client
│   └── swagger.js      # OpenAPI spec definition
├── middleware/
│   ├── auth.js         # authenticate / authorize / optionalAuth
│   └── rateLimit.js    # Rate limiting (5 req/min auth, 100 req/min general)
├── routes/
│   ├── auth.js
│   ├── users.js
│   ├── organizations.js
│   ├── projects.js
│   ├── tasks.js
│   ├── comments.js
│   ├── tags.js
│   └── audit-logs.js
├── utils/
│   ├── logger.js       # Structured logging (files + console)
│   ├── password.js     # bcrypt helpers
│   ├── tokens.js       # JWT helpers
│   └── validation.js   # Zod schemas
└── index.js            # App entry point
```

---

## Production Checklist

- Set strong, unique values for `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`
- Use `DATABASE_URL` with SSL (`?sslmode=require`)
- Set `NODE_ENV=production`
- Restrict `ALLOWED_ORIGINS` to your frontend domain
- Run behind a reverse proxy (nginx) with HTTPS
