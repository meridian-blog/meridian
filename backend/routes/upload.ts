/**
 * File Upload Routes
 * Image/media uploads
 */

import { Router } from '@oak/oak';
import { authMiddleware, requireAuth } from '../middleware/auth.ts';

const router = new Router();
router.use(authMiddleware);

// Simple in-memory upload for development
// In production, use S3/R2/Cloudflare Images

router.post('/image', async (ctx) => {
  if (!requireAuth(ctx)) return;

  let file: File | null = null;
  try {
    const body = await ctx.request.body.formData();
    const entry = body.get('image') ?? body.get('file');
    if (entry instanceof File) {
      file = entry;
    } else {
      // Some clients send Blob not File - wrap it
      for (const [key, value] of body.entries()) {
        if (typeof value !== 'string' && value instanceof Blob) {
          file = new File([value], key + '.upload', { type: value.type });
          break;
        }
      }
    }
  } catch (e) {
    console.error('FormData parse error:', e);
    ctx.response.status = 400;
    ctx.response.body = {
      success: false,
      error: { code: 'PARSE_ERROR', message: 'Failed to parse upload: ' + (e as Error).message },
    };
    return;
  }

  if (!file) {
    ctx.response.status = 400;
    ctx.response.body = { success: false, error: { code: 'NO_FILE', message: 'No file provided' } };
    return;
  }

  // Validate file type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'];
  if (!allowedTypes.includes(file.type)) {
    ctx.response.status = 400;
    ctx.response.body = {
      success: false,
      error: { code: 'INVALID_TYPE', message: 'Only images allowed' },
    };
    return;
  }

  // Max 10MB
  if (file.size > 10 * 1024 * 1024) {
    ctx.response.status = 400;
    ctx.response.body = { success: false, error: { code: 'TOO_LARGE', message: 'Max 10MB' } };
    return;
  }

  // Generate unique filename
  const ext = file.name.split('.').pop() || 'jpg';
  const filename = `${Date.now()}-${Math.random().toString(36).substring(2)}.${ext}`;

  // Save to uploads directory
  const uploadDir = './uploads';
  try {
    await Deno.mkdir(uploadDir, { recursive: true });
  } catch { /* exists */ }

  const bytes = await file.arrayBuffer();
  await Deno.writeFile(`${uploadDir}/${filename}`, new Uint8Array(bytes));

  const domain = Deno.env.get('APP_DOMAIN') || 'localhost:8000';
  const protocol = Deno.env.get('APP_ENV') === 'production' ? 'https' : 'http';

  ctx.response.body = {
    success: true,
    data: {
      url: `${protocol}://${domain}/uploads/${filename}`,
      filename,
      size: file.size,
      type: file.type,
    },
  };
});

export { router as uploadRouter };
