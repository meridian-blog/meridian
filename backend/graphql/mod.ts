/**
 * GraphQL API Module
 * Full GraphQL endpoint for advanced queries
 */

import { Router } from '@oak/oak';

// Temporarily disabled - GraphQL dependencies need fixing
export async function createGraphQLRouter(): Promise<Router> {
  const router = new Router();

  router.get('/', (ctx) => {
    ctx.response.body = {
      success: false,
      message: 'GraphQL temporarily disabled',
    };
  });

  router.post('/', (ctx) => {
    ctx.response.body = {
      success: false,
      message: 'GraphQL temporarily disabled',
    };
  });

  return router;
}
