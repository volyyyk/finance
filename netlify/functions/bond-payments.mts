import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { portfolios } from '../../db/schema.js';
import Bonds from '../../js/bonds.js';
import MoexAPI from '../../js/moex.js';

export default async () => {
  const started = Date.now();
  // Старые портфели обрабатываются первыми; обновления защищены номером версии.
  const rows = await db.select().from(portfolios).orderBy(asc(portfolios.updatedAt)).limit(100);
  for (const row of rows) {
    if (Date.now() - started > 24000) break;
    const products = row.products;
    let changed = false;
    for (const product of products) {
      for (const asset of product.assets || []) {
        if (product.type !== 'investment' || asset.kind !== 'bond' || asset.redeemed || Date.now() - started > 10000) continue;
        if (Bonds.payments(asset).some(p => p.type === 'coupon' && p.date <= Bonds.today() && p.value == null)) {
          try { Object.assign(asset, await MoexAPI.bondSchedule(asset.secid)); changed = true; }
          catch { /* Последние опубликованные суммы остаются доступными для расчёта. */ }
        }
      }
      changed = Bonds.settleProduct(product) || changed;
    }
    await db.update(portfolios).set({ products, updatedAt:new Date(), ...(changed ? {revision:sql`${portfolios.revision} + 1`} : {}) })
      .where(and(eq(portfolios.id,row.id),eq(portfolios.revision,row.revision)));
  }
};
export const config = { schedule:'@hourly' };
