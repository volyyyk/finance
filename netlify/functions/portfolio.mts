import { randomBytes, createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import type { Context } from '@netlify/functions';
import { db } from '../../db/index.js';
import { portfolios } from '../../db/schema.js';

const json = (data: unknown, status = 200) => Response.json(data, { status, headers:{'Cache-Control':'private, no-store'} });
export default async (req: Request, context: Context) => {
  if (!['GET','PUT'].includes(req.method)) return new Response('Method not allowed', {status:405});
  if (req.method === 'PUT' && (req.headers.get('origin') !== new URL(req.url).origin || !req.headers.get('content-type')?.startsWith('application/json')))
    return json({error:'Forbidden'}, 403);
  try {
    let session = context.cookies.get('finance_session');
    if (!session || !/^[a-f0-9]{64}$/.test(session)) {
      if (req.method !== 'GET') return json({error:'Session required'}, 401);
      session = randomBytes(32).toString('hex');
      context.cookies.set({ name:'finance_session', value:session, httpOnly:true, secure:true, sameSite:'Strict', path:'/', maxAge:31536000 });
    }
    const id = createHash('sha256').update(session).digest('hex');
    if (req.method === 'GET') {
      await db.insert(portfolios).values({id}).onConflictDoNothing();
      const [row] = await db.select({products:portfolios.products, revision:portfolios.revision}).from(portfolios).where(eq(portfolios.id,id));
      return json(row);
    }
    const bodyText = await req.text();
    if (bodyText.length > 2_000_000) return json({error:'Too large'}, 413);
    const body = JSON.parse(bodyText);
    if (!Array.isArray(body.products) || body.products.length > 500 || !Number.isInteger(body.revision)) return json({error:'Invalid data'}, 400);
    const [updated] = await db.update(portfolios).set({ products:body.products, revision:sql`${portfolios.revision} + 1`, updatedAt:new Date() })
      .where(and(eq(portfolios.id,id),eq(portfolios.revision,body.revision))).returning({revision:portfolios.revision});
    if (!updated) return json({error:'Conflict'},409);
    return json(updated);
  } catch { return json({error:'Storage unavailable'},503); }
};
export const config = { path:'/api/portfolio' };
