/**
 * Authentication Middleware
 * JWT validation and role-based access control
 */

import type { Context, Next } from '@oak/oak';
import { jwtVerify } from 'jose';
import { queryOne } from '../../db/connection.ts';
import type { Member, MemberTier, User, UserRole } from '../../shared/types.ts';

const appSecret = Deno.env.get('APP_SECRET');
if (!appSecret) {
  console.error('FATAL: APP_SECRET environment variable is not set. Refusing to start.');
  Deno.exit(1);
}
const JWT_SECRET = new TextEncoder().encode(appSecret);

interface JWTPayload {
  sub: string; // user or member id
  type: 'user' | 'member';
  role?: string;
  tier?: string;
  exp: number;
}

interface AuthContext {
  user?: User;
  member?: Member;
  isAuthenticated: boolean;
  isAdmin: boolean;
}

declare module '@oak/oak' {
  interface Context {
    auth: AuthContext;
  }
}

export async function authMiddleware(ctx: Context, next: Next) {
  ctx.auth = { isAuthenticated: false, isAdmin: false };

  const authHeader = ctx.request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    await next();
    return;
  }

  const token = authHeader.slice(7);

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const jwtPayload = payload as unknown as JWTPayload;

    if (jwtPayload.type === 'user') {
      const user = await queryOne<User>(
        'SELECT * FROM users WHERE id = $1',
        [jwtPayload.sub],
      );
      if (user) {
        ctx.auth.user = user;
        ctx.auth.isAuthenticated = true;
        ctx.auth.isAdmin = ['owner', 'admin'].includes(user.role);
      }
    } else if (jwtPayload.type === 'member') {
      const member = await queryOne<Member>(
        'SELECT * FROM members WHERE id = $1',
        [jwtPayload.sub],
      );
      if (member && member.status === 'active') {
        ctx.auth.member = member;
        ctx.auth.isAuthenticated = true;
      }
    }
  } catch (error) {
    // Invalid token, continue as unauthenticated
  }

  await next();
}

export function requireAuth(ctx: Context) {
  if (!ctx.auth.isAuthenticated) {
    ctx.response.status = 401;
    ctx.response.body = {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    };
    return false;
  }
  return true;
}

export function requireAdmin(ctx: Context) {
  if (!ctx.auth.isAuthenticated || !ctx.auth.isAdmin) {
    ctx.response.status = 403;
    ctx.response.body = {
      success: false,
      error: { code: 'FORBIDDEN', message: 'Admin access required' },
    };
    return false;
  }
  return true;
}

export function requireMemberTier(ctx: Context, ...tiers: MemberTier[]) {
  const member = ctx.auth.member;
  if (!member) {
    ctx.response.status = 401;
    ctx.response.body = {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Member access required' },
    };
    return false;
  }

  if (!tiers.includes(member.tier)) {
    ctx.response.status = 403;
    ctx.response.body = {
      success: false,
      error: {
        code: 'TIER_REQUIRED',
        message: `This content requires ${tiers.join(' or ')} tier`,
      },
    };
    return false;
  }

  return true;
}

export async function generateToken(
  id: string,
  type: 'user' | 'member',
  options: { role?: string; tier?: string } = {},
): Promise<string> {
  const { SignJWT } = await import('jose');

  return new SignJWT({
    sub: id,
    type,
    role: options.role,
    tier: options.tier,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET);
}
