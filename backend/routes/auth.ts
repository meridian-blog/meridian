/**
 * Authentication Routes
 * User login, member signup, token management
 */

import { Router } from '@oak/oak';
import * as bcrypt from 'bcrypt';

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
}
import { z } from 'zod';
import { execute, query, queryOne } from '../../db/connection.ts';
import { generateToken } from '../middleware/auth.ts';
import type { Member, User } from '../../shared/types.ts';

const router = new Router();

// Validation schemas
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

// User login (admin/editor/author)
router.post('/login', async (ctx) => {
  const body = await ctx.request.body.json();
  const result = loginSchema.safeParse(body);

  if (!result.success) {
    ctx.response.status = 400;
    ctx.response.body = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        details: result.error.flatten(),
      },
    };
    return;
  }

  const { email, password } = result.data;

  const user = await queryOne<User & { password_hash: string }>(
    'SELECT * FROM users WHERE email = $1',
    [email.toLowerCase()],
  );

  if (!user) {
    ctx.response.status = 401;
    ctx.response.body = {
      success: false,
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
    };
    return;
  }

  const validPassword = await verifyPassword(password, user.password_hash);

  if (!validPassword) {
    ctx.response.status = 401;
    ctx.response.body = {
      success: false,
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
    };
    return;
  }

  // Update last login
  await execute('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

  const token = await generateToken(user.id, 'user', { role: user.role });

  ctx.response.body = {
    success: true,
    data: {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatar: user.avatar,
      },
    },
  };
});

// User registration
router.post('/register', async (ctx) => {
  const body = await ctx.request.body.json();
  const result = registerSchema.safeParse(body);

  if (!result.success) {
    ctx.response.status = 400;
    ctx.response.body = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        details: result.error.flatten(),
      },
    };
    return;
  }

  const { email, password, name } = result.data;

  // Check if email already exists
  const existing = await queryOne<User>(
    'SELECT id FROM users WHERE email = $1',
    [email.toLowerCase()],
  );

  if (existing) {
    ctx.response.status = 409;
    ctx.response.body = {
      success: false,
      error: { code: 'EMAIL_EXISTS', message: 'A user with this email already exists' },
    };
    return;
  }

  const passwordHash = await hashPassword(password);

  const user = await queryOne<{ id: string; email: string; name: string; role: string }>(
    `INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, 'author') RETURNING id, email, name, role`,
    [email.toLowerCase(), passwordHash, name || null],
  );

  const token = await generateToken(user!.id, 'user', { role: user!.role });

  ctx.response.status = 201;
  ctx.response.body = {
    success: true,
    data: {
      token,
      user: {
        id: user!.id,
        email: user!.email,
        name: user!.name,
        role: user!.role,
      },
    },
  };
});

// Member signup (newsletter subscription)
router.post('/subscribe', async (ctx) => {
  const body = await ctx.request.body.json();
  const schema = z.object({ email: z.string().email(), name: z.string().optional() });
  const result = schema.safeParse(body);

  if (!result.success) {
    ctx.response.status = 400;
    ctx.response.body = {
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid email' },
    };
    return;
  }

  const { email, name } = result.data;

  // Check if member exists
  const existing = await queryOne<Member>('SELECT * FROM members WHERE email = $1', [
    email.toLowerCase(),
  ]);

  if (existing) {
    ctx.response.body = {
      success: true,
      data: { message: 'Already subscribed', memberId: existing.id },
    };
    return;
  }

  // Create new member
  const member = await queryOne<Member>(
    `INSERT INTO members (email, name, tier, status) 
     VALUES ($1, $2, 'free', 'active') 
     RETURNING *`,
    [email.toLowerCase(), name || null],
  );

  const token = await generateToken(member!.id, 'member', { tier: 'free' });

  ctx.response.status = 201;
  ctx.response.body = {
    success: true,
    data: {
      token,
      member: {
        id: member!.id,
        email: member!.email,
        name: member!.name,
        tier: member!.tier,
      },
    },
  };
});

// Member login (magic link style with token)
router.post('/member/login', async (ctx) => {
  const body = await ctx.request.body.json();
  const result = z.object({ email: z.string().email() }).safeParse(body);

  if (!result.success) {
    ctx.response.status = 400;
    ctx.response.body = {
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid email' },
    };
    return;
  }

  const { email } = result.data;

  const member = await queryOne<Member>('SELECT * FROM members WHERE email = $1', [
    email.toLowerCase(),
  ]);

  if (!member) {
    ctx.response.status = 404;
    ctx.response.body = {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Member not found' },
    };
    return;
  }

  const token = await generateToken(member.id, 'member', { tier: member.tier });

  // In production, send this via email
  ctx.response.body = {
    success: true,
    data: {
      message: 'Login token generated (send via email in production)',
      token,
      member: {
        id: member.id,
        email: member.email,
        name: member.name,
        tier: member.tier,
      },
    },
  };
});

// Verify token and get current user/member
router.get('/me', async (ctx) => {
  const authHeader = ctx.request.headers.get('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    ctx.response.status = 401;
    ctx.response.body = {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'No token provided' },
    };
    return;
  }

  // Token verification is done in authMiddleware, but for this route we handle it directly
  const token = authHeader.slice(7);

  try {
    const { jwtVerify } = await import('jose');
    const JWT_SECRET = new TextEncoder().encode(
      Deno.env.get('APP_SECRET') || 'your-super-secret-key-min-32-chars!!',
    );
    const { payload } = await jwtVerify(token, JWT_SECRET);

    if (payload.type === 'user') {
      const user = await queryOne<User>(
        'SELECT id, email, name, role, avatar, created_at FROM users WHERE id = $1',
        [payload.sub],
      );
      if (!user) throw new Error('User not found');
      ctx.response.body = { success: true, data: { type: 'user', ...user } };
    } else {
      const member = await queryOne<Member>(
        'SELECT id, email, name, tier, status, created_at FROM members WHERE id = $1',
        [payload.sub],
      );
      if (!member) throw new Error('Member not found');
      ctx.response.body = { success: true, data: { type: 'member', ...member } };
    }
  } catch {
    ctx.response.status = 401;
    ctx.response.body = {
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' },
    };
  }
});

export { router as authRouter };
