# M015: Production API & Database Design

## Overview

Implement production-ready API and database infrastructure for KIN platform, replacing mock data with real PostgreSQL storage and adding JWT authentication with Telegram login integration.

## Technology Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Database | PostgreSQL | Specified in task, production-ready, full-featured |
| API Framework | Fastify | Faster than Express, better TypeScript support, built-in schema validation |
| ORM | Prisma | Type-safe queries, auto-generated types, migration-friendly |
| Auth | JWT + Telegram Widget | Stateless auth, native Telegram integration |
| Real-time | WebSocket (existing) | Bridge to existing M008 infrastructure |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Mission Control Frontend                      │
│  (React + Three.js - replaces mock data with API calls)        │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS + WebSocket
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Fastify API Server                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ /auth    │ │ /kin     │ │ /convos  │ │ /nft     │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────────┐            │
│  │ /health  │ │ /ws      │ │ Middleware           │            │
│  │          │ │          │ │ (rate-limit, auth)   │            │
│  └──────────┘ └──────────┘ └──────────────────────┘            │
└────────────────────────────┬────────────────────────────────────┘
                             │ Prisma Client
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      PostgreSQL Database                         │
│  users │ conversations │ messages │ kin_status │ nft_ownership │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│               Python Daemon (existing)                           │
│  health_monitor_daemon.py → JSON files → API reads              │
└─────────────────────────────────────────────────────────────────┘
```

## Database Schema

### Users Table

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT UNIQUE NOT NULL,
  username VARCHAR(255),
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  photo_url TEXT,
  tier VARCHAR(50) DEFAULT 'free',  -- free, pro, enterprise
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_telegram ON users(telegram_id);
```

### Conversations Table

```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  kin_id VARCHAR(100) NOT NULL,  -- e.g., "cipher-001"
  title VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conversations_user ON conversations(user_id);
CREATE INDEX idx_conversations_kin ON conversations(kin_id);
```

### Messages Table

```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB  -- tokens, model, latency, etc.
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, timestamp DESC);
```

### Kin Status Table

```sql
CREATE TABLE kin_status (
  record_id VARCHAR(100) PRIMARY KEY DEFAULT 'ksr-' || substr(md5(random()::text), 1, 8),
  kin_id VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('healthy', 'degraded', 'offline')),
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  glb_url TEXT,
  specialization VARCHAR(100),
  owner_consent_flags JSONB DEFAULT '{}',
  support_safe_summary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kin_status_status ON kin_status(status);
```

### NFT Ownership Table

```sql
CREATE TABLE nft_ownership (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  mint_address VARCHAR(100) NOT NULL,
  companion_type VARCHAR(100) NOT NULL,  -- e.g., "cipher-kraken", "mischief-pup"
  glb_url TEXT,
  acquired_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, mint_address)
);

CREATE INDEX idx_nft_user ON nft_ownership(user_id);
CREATE INDEX idx_nft_mint ON nft_ownership(mint_address);
```

## API Routes

### Authentication

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/telegram` | Verify Telegram login, issue JWT |
| POST | `/api/auth/refresh` | Refresh JWT token |
| GET | `/api/auth/me` | Get current user profile |
| POST | `/api/auth/logout` | Invalidate session |

### Kin Status

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/kin` | List all Kin status | Public |
| GET | `/api/kin/:kinId` | Get specific Kin | Public |
| POST | `/api/kin` | Create Kin record | Admin |
| PATCH | `/api/kin/:kinId` | Update Kin status | Admin |
| DELETE | `/api/kin/:kinId` | Delete Kin record | Admin |

### Conversations

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/conversations` | List user's conversations | Required |
| POST | `/api/conversations` | Create new conversation | Required |
| GET | `/api/conversations/:id/messages` | Get messages | Required |
| POST | `/api/conversations/:id/messages` | Add message | Required |

### NFT Ownership

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/nft/ownership` | List user's NFTs | Required |
| POST | `/api/nft/ownership` | Link NFT to account | Required |
| GET | `/api/nft/:mintAddress` | Get NFT details | Public |

### Health & Monitoring

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | API health check |
| GET | `/api/vps/:vpsId/health` | VPS health (bridges to daemon) |
| GET | `/api/drift/status` | Drift detection status |

## Authentication Flow

### Telegram Login Widget

```
1. Frontend renders Telegram Login Widget
2. User clicks and authenticates with Telegram
3. Telegram redirects with signed user data:
   {
     id: number,
     first_name: string,
     last_name: string,
     username: string,
     photo_url: string,
     auth_date: number,
     hash: string
   }
4. API receives data at POST /api/auth/telegram
5. API verifies signature:
   - Concatenate fields alphabetically
   - Compute HMAC-SHA256 with bot token
   - Compare to provided hash
   - Verify auth_date within 24 hours
6. API creates/updates user record
7. API issues JWT (24h expiry)
8. Frontend stores JWT, includes in subsequent requests
```

### JWT Structure

```typescript
interface JwtPayload {
  sub: string;        // user id (UUID)
  telegram_id: number;
  tier: string;       // free, pro, enterprise
  iat: number;        // issued at
  exp: number;        // expiry (24h)
}
```

## Rate Limiting

| Endpoint Category | Limit | Window |
|-------------------|-------|--------|
| General API | 100 requests | 1 minute |
| Auth endpoints | 10 requests | 1 minute |
| WebSocket connections | 5 per user | - |
| Health checks | 60 requests | 1 minute |

## Mission Control Integration

### Changes Required

1. **API Client Module**
   - Create `src/api/client.ts` with fetch wrapper
   - Handle authentication headers
   - Error handling with fallback to mock data

2. **Authentication State**
   - Add `AuthContext` for user/session state
   - Telegram Login Widget integration
   - Token refresh logic

3. **Data Fetching**
   - Replace `getMockData()` with real API calls
   - Add loading states
   - Error boundaries with dev fallback

4. **WebSocket Connection**
   - Connect to `/api/ws` endpoint
   - Subscribe to kin status updates
   - Handle reconnection

### Environment Variables

```env
# API Configuration
VITE_API_URL=http://localhost:3000
VITE_WS_URL=ws://localhost:3000

# Telegram Login Widget
VITE_TELEGRAM_BOT_ID=123456789

# Feature Flags
VITE_USE_MOCK_DATA=false
```

## File Structure

```
db/
  schema.sql              # Complete database schema
  migrations/
    001_initial_schema.sql
    002_add_indices.sql
  seed.sql               # Development seed data

api/
  server.ts              # Fastify app entry point
  routes/
    health.ts            # GET /api/health
    kin.ts               # Kin CRUD endpoints
    conversations.ts     # Conversation history
    nft.ts               # NFT ownership endpoints
    auth.ts              # Authentication endpoints
    websocket.ts         # WebSocket server
  auth/
    jwt.ts               # JWT generation/validation
    telegram.ts          # Telegram signature verification
  middleware/
    rate-limit.ts        # @fastify/rate-limit config
    request-log.ts       # Request logging
    auth-guard.ts        # JWT verification middleware
  db/
    client.ts            # Prisma client singleton
    seed.ts              # Database seeding script

packages/mission-control/src/
  api/
    client.ts            # API fetch wrapper
    auth.ts              # Auth context/hooks
  hooks/
    useAuth.ts           # Authentication hook
    useWebSocket.ts      # WebSocket hook (update existing)
```

## Migration from Existing Infrastructure

### Python Daemon Integration

1. Health monitor daemon continues writing JSON files
2. API reads JSON files and serves via `/api/vps/:vpsId/health`
3. Future: Replace file-based with direct API calls from daemon

### Mock Data Fallback

1. `import.meta.env.DEV` check preserved
2. API unavailable in dev → fallback to mock
3. Production → API required, no fallback

## Security Considerations

1. **JWT Secrets**: 256-bit random keys, rotated quarterly
2. **Telegram Bot Token**: Stored in environment, never in code
3. **CORS**: Whitelist specific origins in production
4. **Input Validation**: Fastify schema validation on all endpoints
5. **SQL Injection**: Prisma parameterized queries
6. **Rate Limiting**: Prevent abuse on auth endpoints

## Testing Strategy

1. **Unit Tests**: Route handlers, auth functions
2. **Integration Tests**: API + database
3. **E2E Tests**: Mission Control login flow
4. **Load Tests**: Rate limiting verification

## Deployment Notes

1. Database: Managed PostgreSQL (Supabase, Railway, or self-hosted)
2. API: Node.js container on VPS
3. Environment: Docker Compose for local, Kubernetes for production
4. Secrets: Environment variables, not files
