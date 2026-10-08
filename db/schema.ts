import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
export const cmsState = sqliteTable('cms_state', { id: integer('id').primaryKey(), revision: integer('revision').notNull(), data: text('data').notNull(), updatedAt: text('updated_at').notNull() });
export const cmsHistory = sqliteTable('cms_history', { revision: integer('revision').primaryKey(), data: text('data').notNull(), updatedAt: text('updated_at').notNull() });
