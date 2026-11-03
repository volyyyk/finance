import { pgTable, text, jsonb, integer, timestamp } from 'drizzle-orm/pg-core';

export const portfolios = pgTable('portfolios', {
  id: text('id').primaryKey(),
  products: jsonb('products').$type<any[]>().notNull().default([]),
  revision: integer('revision').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
