import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

export const itemStatusEnum = pgEnum("item_status", [
  "idea",
  "speccing",
  "ready",
  "building",
  "evaluating",
  "shipped",
  "parked",
  "dead",
]);

export const itemPriorityEnum = pgEnum("item_priority", [
  "critical",
  "high",
  "medium",
  "low",
  "none",
]);

export const agentRunStatusEnum = pgEnum("agent_run_status", [
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);

export const agentRunCiStatusEnum = pgEnum("agent_run_ci_status", [
  "pending",
  "passed",
  "failed",
  "unknown",
]);

const currentUserSql = sql`coalesce(current_setting('app.current_user', true), 'system')`;

export const items = pgTable(
  "items",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    title: varchar("title", { length: 255 }).notNull(),
    status: itemStatusEnum("status").notNull().default("idea"),
    priority: itemPriorityEnum("priority").notNull().default("none"),
    description: text("description"),
    parentId: integer("parent_id").references(
      (): AnyPgColumn => items.id,
      { onDelete: "set null" },
    ),
    createdBy: text("created_by").notNull().default(currentUserSql),
    updatedBy: text("updated_by").notNull().default(currentUserSql),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    statusIdx: index("items_status_idx").on(table.status),
    priorityIdx: index("items_priority_idx").on(table.priority),
    createdAtIdx: index("items_created_at_idx").on(table.createdAt),
    parentIdIdx: index("items_parent_id_idx").on(table.parentId),
  }),
);

export const tags = pgTable(
  "tags",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    name: varchar("name", { length: 64 }).notNull(),
    color: varchar("color", { length: 32 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    nameIdx: uniqueIndex("tags_name_idx").on(table.name),
  }),
);

export const itemTags = pgTable(
  "item_tags",
  {
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.itemId, table.tagId], name: "item_tags_pk" }),
  }),
);

export const itemDependencies = pgTable(
  "item_dependencies",
  {
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    dependsOnId: integer("depends_on_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.itemId, table.dependsOnId],
      name: "item_dependencies_pk",
    }),
    dependsOnIdx: index("item_dependencies_depends_on_idx").on(table.dependsOnId),
    noSelfReference: check(
      "item_dependencies_no_self_reference",
      sql`${table.itemId} <> ${table.dependsOnId}`,
    ),
  }),
);

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    agent: varchar("agent", { length: 64 }).notNull(),
    branch: varchar("branch", { length: 255 }),
    status: agentRunStatusEnum("status").notNull().default("running"),
    prUrl: text("pr_url"),
    ciStatus: agentRunCiStatusEnum("ci_status").notNull().default("unknown"),
    notes: text("notes"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    itemIdIdx: index("agent_runs_item_id_idx").on(table.itemId),
  }),
);

export const changelog = pgTable("changelog", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  itemId: integer("item_id")
    .notNull()
    .references(() => items.id, { onDelete: "cascade" }),
  fieldName: varchar("field_name", { length: 64 }).notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  changedBy: text("changed_by"),
  changedAt: timestamp("changed_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const itemsRelations = relations(items, ({ one, many }) => ({
  parent: one(items, {
    fields: [items.parentId],
    references: [items.id],
    relationName: "item_parent",
  }),
  children: many(items, {
    relationName: "item_parent",
  }),
  itemTags: many(itemTags),
  dependencies: many(itemDependencies, {
    relationName: "item_dependencies_item",
  }),
  dependents: many(itemDependencies, {
    relationName: "item_dependencies_depends_on",
  }),
  runs: many(agentRuns),
  changelogEntries: many(changelog),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  itemTags: many(itemTags),
}));

export const itemTagsRelations = relations(itemTags, ({ one }) => ({
  item: one(items, {
    fields: [itemTags.itemId],
    references: [items.id],
  }),
  tag: one(tags, {
    fields: [itemTags.tagId],
    references: [tags.id],
  }),
}));

export const itemDependenciesRelations = relations(itemDependencies, ({ one }) => ({
  item: one(items, {
    fields: [itemDependencies.itemId],
    references: [items.id],
    relationName: "item_dependencies_item",
  }),
  dependsOn: one(items, {
    fields: [itemDependencies.dependsOnId],
    references: [items.id],
    relationName: "item_dependencies_depends_on",
  }),
}));

export const agentRunsRelations = relations(agentRuns, ({ one }) => ({
  item: one(items, {
    fields: [agentRuns.itemId],
    references: [items.id],
  }),
}));

export const changelogRelations = relations(changelog, ({ one }) => ({
  item: one(items, {
    fields: [changelog.itemId],
    references: [items.id],
  }),
}));

export type ItemStatus = (typeof itemStatusEnum.enumValues)[number];
export type ItemPriority = (typeof itemPriorityEnum.enumValues)[number];
export type AgentRunStatus = (typeof agentRunStatusEnum.enumValues)[number];
export type AgentRunCiStatus = (typeof agentRunCiStatusEnum.enumValues)[number];
