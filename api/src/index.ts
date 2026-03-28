import type { Context } from "hono";
import { Hono } from "hono";
import { serve } from "bun";
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  ne,
  isNull,
  sql,
} from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { config } from "./config";
import { checkDatabase, db, runInTransaction } from "./db";
import type { DbTransaction } from "./db";
import { addClient, broadcast, removeClient } from "./ws";
import {
  agentRunCiStatusEnum,
  agentRunStatusEnum,
  agentRuns,
  changelog,
  itemDependencies,
  itemPriorityEnum,
  itemStatusEnum,
  itemTags,
  items,
  tags,
} from "./schema";

const app = new Hono();

const ITEM_STATUSES = new Set(itemStatusEnum.enumValues);
const ITEM_PRIORITIES = new Set(itemPriorityEnum.enumValues);
const RUN_STATUSES = new Set(agentRunStatusEnum.enumValues);
const RUN_CI_STATUSES = new Set(agentRunCiStatusEnum.enumValues);
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const RECENT_RUNS_LIMIT = 10;
const priorityRank = sql<number>`case ${items.priority}
  when 'critical' then 0
  when 'high' then 1
  when 'medium' then 2
  when 'low' then 3
  else 4
end`;
const blockingDependencyItems = alias(items, "blocking_dependency_items");
const blockedReadyRank = sql<number>`case
  when ${items.status} = 'ready'
    and ${exists(
      db
        .select({ value: sql`1` })
        .from(itemDependencies)
        .innerJoin(
          blockingDependencyItems,
          eq(itemDependencies.dependsOnId, blockingDependencyItems.id),
        )
        .where(
          and(
            eq(itemDependencies.itemId, items.id),
            ne(blockingDependencyItems.status, "shipped"),
          ),
        ),
    )}
  then 1
  else 0
end`;

type Queryable = typeof db | DbTransaction;
type SortField = "created_at" | "updated_at" | "priority";
type SortDirection = "asc" | "desc";

class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const looksLikeDatabaseError = (
  error: unknown,
): error is { code: string; detail?: string } => {
  return isRecord(error) && typeof error.code === "string";
};

const formatTimestamp = (value: Date | string | null) => {
  if (value === null) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
};

const getActor = (c: Context) => {
  const actor = c.req.header("x-drydock-user")?.trim();
  return actor && actor.length > 0 ? actor : "system";
};

const respond = <T>(c: Context, data: T, status = 200) => {
  return c.json({ data }, status);
};

const parseId = (value: string | undefined, field: string) => {
  if (!value) {
    throw new ApiError(400, "invalid_id", `${field} is required.`);
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ApiError(400, "invalid_id", `${field} must be a positive integer.`);
  }

  return parsed;
};

const parseOptionalBodyId = (
  value: unknown,
  field: string,
  options: { nullable?: boolean } = {},
) => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    if (options.nullable) {
      return null;
    }

    throw new ApiError(400, "validation_error", `${field} cannot be null.`);
  }

  if (!Number.isInteger(value) || Number(value) <= 0) {
    throw new ApiError(
      400,
      "validation_error",
      `${field} must be a positive integer.`,
    );
  }

  return Number(value);
};

const parseQueryId = (
  value: string | undefined,
  field: string,
  options: { nullableKeyword?: boolean } = {},
) => {
  if (value === undefined) {
    return undefined;
  }

  if (options.nullableKeyword && value === "null") {
    return null;
  }

  return parseId(value, field);
};

const parseText = (
  value: unknown,
  field: string,
  options: {
    required?: boolean;
    nullable?: boolean;
    trim?: boolean;
    nonEmpty?: boolean;
    maxLength?: number;
  } = {},
) => {
  if (value === undefined) {
    if (options.required) {
      throw new ApiError(400, "validation_error", `${field} is required.`);
    }

    return undefined;
  }

  if (value === null) {
    if (options.nullable) {
      return null;
    }

    throw new ApiError(400, "validation_error", `${field} cannot be null.`);
  }

  if (typeof value !== "string") {
    throw new ApiError(400, "validation_error", `${field} must be a string.`);
  }

  const normalized = options.trim ? value.trim() : value;
  if (options.nonEmpty && normalized.length === 0) {
    throw new ApiError(400, "validation_error", `${field} cannot be empty.`);
  }

  if (options.maxLength && normalized.length > options.maxLength) {
    throw new ApiError(
      400,
      "validation_error",
      `${field} must be at most ${options.maxLength} characters.`,
    );
  }

  return normalized;
};

const parseEnum = <T extends string>(
  value: unknown,
  field: string,
  allowedValues: ReadonlySet<T>,
  fallback?: T,
) => {
  if (value === undefined) {
    if (fallback !== undefined) {
      return fallback;
    }

    return undefined;
  }

  if (typeof value !== "string" || !allowedValues.has(value as T)) {
    throw new ApiError(
      400,
      "validation_error",
      `${field} must be one of: ${Array.from(allowedValues).join(", ")}.`,
    );
  }

  return value as T;
};

const parseColor = (value: unknown, field: string, required = false) => {
  if (value === undefined) {
    if (required) {
      throw new ApiError(400, "validation_error", `${field} is required.`);
    }

    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== "string" || !COLOR_PATTERN.test(value)) {
    throw new ApiError(
      400,
      "validation_error",
      `${field} must match #RRGGBB.`,
    );
  }

  return value;
};

const parseTimestamp = (
  value: unknown,
  field: string,
  options: { nullable?: boolean } = {},
) => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    if (options.nullable) {
      return null;
    }

    throw new ApiError(400, "validation_error", `${field} cannot be null.`);
  }

  if (typeof value !== "string") {
    throw new ApiError(400, "validation_error", `${field} must be an ISO timestamp.`);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ApiError(400, "validation_error", `${field} must be an ISO timestamp.`);
  }

  return parsed;
};

const parseLimit = (value: string | undefined) => {
  if (value === undefined) {
    return DEFAULT_LIMIT;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_LIMIT) {
    throw new ApiError(
      400,
      "validation_error",
      `limit must be an integer between 1 and ${MAX_LIMIT}.`,
    );
  }

  return parsed;
};

const parseOffset = (value: string | undefined) => {
  if (value === undefined) {
    return 0;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new ApiError(
      400,
      "validation_error",
      "offset must be a non-negative integer.",
    );
  }

  return parsed;
};

const parseSortField = (value: string | undefined): SortField => {
  if (value === undefined) {
    return "created_at";
  }

  if (value !== "created_at" && value !== "updated_at" && value !== "priority") {
    throw new ApiError(
      400,
      "validation_error",
      "sort must be one of: created_at, updated_at, priority.",
    );
  }

  return value;
};

const parseSortDirection = (value: string | undefined, sort: SortField) => {
  if (value === undefined) {
    return sort === "priority" ? "asc" : "desc";
  }

  if (value !== "asc" && value !== "desc") {
    throw new ApiError(
      400,
      "validation_error",
      "direction must be either asc or desc.",
    );
  }

  return value;
};

const parseJsonBody = async (c: Context) => {
  let body: unknown;

  try {
    body = await c.req.json();
  } catch {
    throw new ApiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  if (!isRecord(body)) {
    throw new ApiError(400, "invalid_json", "Request body must be a JSON object.");
  }

  return body;
};

const getItemOrder = (sort: SortField, direction: SortDirection) => {
  if (sort === "created_at") {
    return [
      direction === "asc" ? asc(items.createdAt) : desc(items.createdAt),
      desc(items.id),
    ] as const;
  }

  if (sort === "updated_at") {
    return [
      direction === "asc" ? asc(items.updatedAt) : desc(items.updatedAt),
      desc(items.id),
    ] as const;
  }

  return [
    direction === "asc" ? asc(priorityRank) : desc(priorityRank),
    asc(blockedReadyRank),
    desc(items.updatedAt),
    desc(items.id),
  ] as const;
};

const serializeItem = (item: {
  id: number;
  title: string;
  status: string;
  priority: string;
  description: string | null;
  parentId: number | null;
  createdBy: string;
  updatedBy: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}) => {
  return {
    id: item.id,
    title: item.title,
    status: item.status,
    priority: item.priority,
    description: item.description,
    parent_id: item.parentId,
    created_by: item.createdBy,
    updated_by: item.updatedBy,
    created_at: formatTimestamp(item.createdAt),
    updated_at: formatTimestamp(item.updatedAt),
  };
};

const serializeTag = (tag: {
  id: number;
  name: string;
  color: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}) => {
  return {
    id: tag.id,
    name: tag.name,
    color: tag.color,
    created_at: formatTimestamp(tag.createdAt),
    updated_at: formatTimestamp(tag.updatedAt),
  };
};

const serializeRun = (run: {
  id: number;
  itemId: number;
  agent: string;
  branch: string | null;
  status: string;
  prUrl: string | null;
  ciStatus: string;
  notes: string | null;
  startedAt: Date | string;
  completedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}) => {
  return {
    id: run.id,
    item_id: run.itemId,
    agent: run.agent,
    branch: run.branch,
    status: run.status,
    pr_url: run.prUrl,
    ci_status: run.ciStatus,
    notes: run.notes,
    started_at: formatTimestamp(run.startedAt),
    completed_at: formatTimestamp(run.completedAt),
    created_at: formatTimestamp(run.createdAt),
    updated_at: formatTimestamp(run.updatedAt),
  };
};

const serializeChangelog = (entry: {
  id: number;
  itemId: number;
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string | null;
  changedAt: Date | string;
}) => {
  return {
    id: entry.id,
    item_id: entry.itemId,
    field_name: entry.fieldName,
    old_value: entry.oldValue,
    new_value: entry.newValue,
    changed_by: entry.changedBy,
    changed_at: formatTimestamp(entry.changedAt),
  };
};

const findItemById = async (database: Queryable, id: number) => {
  const [item] = await database.select().from(items).where(eq(items.id, id)).limit(1);
  return item ?? null;
};

const findTagById = async (database: Queryable, id: number) => {
  const [tag] = await database.select().from(tags).where(eq(tags.id, id)).limit(1);
  return tag ?? null;
};

const findTagByName = async (database: Queryable, name: string) => {
  const [tag] = await database.select().from(tags).where(eq(tags.name, name)).limit(1);
  return tag ?? null;
};

const findRunById = async (database: Queryable, id: number) => {
  const [run] = await database
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.id, id))
    .limit(1);
  return run ?? null;
};

const requireItem = async (database: Queryable, id: number) => {
  const item = await findItemById(database, id);
  if (!item) {
    throw new ApiError(404, "item_not_found", `Item ${id} was not found.`);
  }

  return item;
};

const requireTag = async (database: Queryable, id: number) => {
  const tag = await findTagById(database, id);
  if (!tag) {
    throw new ApiError(404, "tag_not_found", `Tag ${id} was not found.`);
  }

  return tag;
};

const requireRun = async (database: Queryable, id: number) => {
  const run = await findRunById(database, id);
  if (!run) {
    throw new ApiError(404, "run_not_found", `Run ${id} was not found.`);
  }

  return run;
};

const listDependencyItems = async (database: Queryable, itemId: number) => {
  const dependencyItems = alias(items, "dependency_items");

  return database
    .select({
      id: dependencyItems.id,
      title: dependencyItems.title,
      status: dependencyItems.status,
      priority: dependencyItems.priority,
      description: dependencyItems.description,
      parentId: dependencyItems.parentId,
      createdBy: dependencyItems.createdBy,
      updatedBy: dependencyItems.updatedBy,
      createdAt: dependencyItems.createdAt,
      updatedAt: dependencyItems.updatedAt,
    })
    .from(itemDependencies)
    .innerJoin(dependencyItems, eq(itemDependencies.dependsOnId, dependencyItems.id))
    .where(eq(itemDependencies.itemId, itemId))
    .orderBy(desc(dependencyItems.updatedAt), desc(dependencyItems.id));
};

const listDependentItems = async (database: Queryable, itemId: number) => {
  const dependentItems = alias(items, "dependent_items");

  return database
    .select({
      id: dependentItems.id,
      title: dependentItems.title,
      status: dependentItems.status,
      priority: dependentItems.priority,
      description: dependentItems.description,
      parentId: dependentItems.parentId,
      createdBy: dependentItems.createdBy,
      updatedBy: dependentItems.updatedBy,
      createdAt: dependentItems.createdAt,
      updatedAt: dependentItems.updatedAt,
    })
    .from(itemDependencies)
    .innerJoin(dependentItems, eq(itemDependencies.itemId, dependentItems.id))
    .where(eq(itemDependencies.dependsOnId, itemId))
    .orderBy(desc(dependentItems.updatedAt), desc(dependentItems.id));
};

const listItemTags = async (database: Queryable, itemId: number) => {
  return database
    .select({
      id: tags.id,
      name: tags.name,
      color: tags.color,
      createdAt: tags.createdAt,
      updatedAt: tags.updatedAt,
    })
    .from(itemTags)
    .innerJoin(tags, eq(itemTags.tagId, tags.id))
    .where(eq(itemTags.itemId, itemId))
    .orderBy(asc(tags.name), asc(tags.id));
};

const listRecentRuns = async (database: Queryable, itemId: number) => {
  return database
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.itemId, itemId))
    .orderBy(desc(agentRuns.startedAt), desc(agentRuns.id))
    .limit(RECENT_RUNS_LIMIT);
};

const isItemBlocked = async (database: Queryable, itemId: number) => {
  const dependencyItems = alias(items, "dependency_items_for_blocked");
  const blockingDependencies = await database
    .select({ value: sql<number>`1` })
    .from(itemDependencies)
    .innerJoin(dependencyItems, eq(itemDependencies.dependsOnId, dependencyItems.id))
    .where(
      and(
        eq(itemDependencies.itemId, itemId),
        ne(dependencyItems.status, "shipped"),
      ),
    )
    .limit(1);

  return blockingDependencies.length > 0;
};

const assertNoCircularDependency = async (
  database: Queryable,
  itemId: number,
  dependsOnId: number,
) => {
  const visited = new Set<number>();
  const stack = [dependsOnId];

  while (stack.length > 0) {
    const currentId = stack.pop() as number;

    if (currentId === itemId) {
      throw new ApiError(
        400,
        "circular_dependency",
        `Adding dependency ${itemId} -> ${dependsOnId} would create a cycle.`,
      );
    }

    if (visited.has(currentId)) {
      continue;
    }

    visited.add(currentId);

    const nextDependencies = await database
      .select({
        dependsOnId: itemDependencies.dependsOnId,
      })
      .from(itemDependencies)
      .where(eq(itemDependencies.itemId, currentId));

    for (const dependency of nextDependencies) {
      if (!visited.has(dependency.dependsOnId)) {
        stack.push(dependency.dependsOnId);
      }
    }
  }
};

const serializeDetailedItem = async (
  database: Queryable,
  item: {
    id: number;
    title: string;
    status: string;
    priority: string;
    description: string | null;
    parentId: number | null;
    createdBy: string;
    updatedBy: string;
    createdAt: Date | string;
    updatedAt: Date | string;
  },
  depth = 0,
) => {
  const emptyItems: Awaited<ReturnType<typeof listDependencyItems>> = [];
  const [tagRows, runRows, blocked, dependencyRows, dependentRows] = await Promise.all([
    listItemTags(database, item.id),
    listRecentRuns(database, item.id),
    isItemBlocked(database, item.id),
    depth === 0
      ? listDependencyItems(database, item.id)
      : Promise.resolve(emptyItems),
    depth === 0 ? listDependentItems(database, item.id) : Promise.resolve(emptyItems),
  ]);

  return {
    ...serializeItem(item),
    tags: tagRows.map(serializeTag),
    recent_runs: runRows.map(serializeRun),
    dependencies: await Promise.all(
      dependencyRows.map((dependency) => serializeDetailedItem(database, dependency, depth + 1)),
    ),
    dependents: await Promise.all(
      dependentRows.map((dependent) => serializeDetailedItem(database, dependent, depth + 1)),
    ),
    blocked,
  };
};

const validateParent = async (
  database: Queryable,
  parentId: number | null | undefined,
  itemId?: number,
) => {
  if (parentId === undefined || parentId === null) {
    return;
  }

  if (itemId !== undefined && parentId === itemId) {
    throw new ApiError(
      400,
      "invalid_parent",
      "parent_id cannot reference the item being updated.",
    );
  }

  const parent = await findItemById(database, parentId);
  if (!parent) {
    throw new ApiError(
      400,
      "invalid_parent",
      `parent_id ${parentId} does not reference an existing item.`,
    );
  }
};

const parseCreateItemBody = (body: Record<string, unknown>) => {
  return {
    title: parseText(body.title, "title", {
      required: true,
      trim: true,
      nonEmpty: true,
      maxLength: 255,
    }) as string,
    status: parseEnum(body.status, "status", ITEM_STATUSES, "idea"),
    priority: parseEnum(body.priority, "priority", ITEM_PRIORITIES, "none"),
    description:
      parseText(body.description, "description", {
        nullable: true,
      }) ?? null,
    parentId: parseOptionalBodyId(body.parent_id, "parent_id", { nullable: true }) ?? null,
  };
};

const parsePatchItemBody = (body: Record<string, unknown>) => {
  const patch = {
    title: parseText(body.title, "title", {
      trim: true,
      nonEmpty: true,
      maxLength: 255,
    }),
    status: parseEnum(body.status, "status", ITEM_STATUSES),
    priority: parseEnum(body.priority, "priority", ITEM_PRIORITIES),
    description: parseText(body.description, "description", { nullable: true }),
    parentId: parseOptionalBodyId(body.parent_id, "parent_id", { nullable: true }),
  };

  if (Object.values(patch).every((value) => value === undefined)) {
    throw new ApiError(
      400,
      "validation_error",
      "At least one mutable item field must be provided.",
    );
  }

  return patch;
};

const parseCreateTagBody = (body: Record<string, unknown>) => {
  return {
    name: parseText(body.name, "name", {
      required: true,
      trim: true,
      nonEmpty: true,
      maxLength: 64,
    }) as string,
    color: parseColor(body.color, "color") ?? null,
  };
};

const parsePatchTagBody = (body: Record<string, unknown>) => {
  const patch = {
    name: parseText(body.name, "name", {
      trim: true,
      nonEmpty: true,
      maxLength: 64,
    }),
    color: parseColor(body.color, "color"),
  };

  if (Object.values(patch).every((value) => value === undefined)) {
    throw new ApiError(
      400,
      "validation_error",
      "At least one mutable tag field must be provided.",
    );
  }

  return patch;
};

const parseAssignTagBody = (body: Record<string, unknown>) => {
  const tagId = parseOptionalBodyId(body.tag_id, "tag_id");
  const tagName = parseText(body.tag_name, "tag_name", {
    trim: true,
    nonEmpty: true,
    maxLength: 64,
  });

  if ((tagId === undefined && tagName === undefined) || (tagId && tagName)) {
    throw new ApiError(
      400,
      "validation_error",
      "Provide exactly one of tag_id or tag_name.",
    );
  }

  return { tagId, tagName };
};

const parseCreateDependencyBody = (body: Record<string, unknown>) => {
  const dependsOnId = parseOptionalBodyId(body.depends_on, "depends_on");

  if (dependsOnId === undefined) {
    throw new ApiError(400, "validation_error", "depends_on is required.");
  }

  return { dependsOnId };
};

const parseCreateRunBody = (body: Record<string, unknown>) => {
  return {
    agent: parseText(body.agent, "agent", {
      required: true,
      trim: true,
      nonEmpty: true,
      maxLength: 64,
    }) as string,
    branch: parseText(body.branch, "branch", { nullable: true, maxLength: 255 }) ?? null,
    status: parseEnum(body.status, "status", RUN_STATUSES, "running"),
    prUrl: parseText(body.pr_url, "pr_url", { nullable: true }) ?? null,
    ciStatus: parseEnum(body.ci_status, "ci_status", RUN_CI_STATUSES, "unknown"),
    notes: parseText(body.notes, "notes", { nullable: true }) ?? null,
    completedAt: parseTimestamp(body.completed_at, "completed_at", {
      nullable: true,
    }),
  };
};

const parsePatchRunBody = (body: Record<string, unknown>) => {
  const patch = {
    status: parseEnum(body.status, "status", RUN_STATUSES),
    branch: parseText(body.branch, "branch", { nullable: true, maxLength: 255 }),
    prUrl: parseText(body.pr_url, "pr_url", { nullable: true }),
    ciStatus: parseEnum(body.ci_status, "ci_status", RUN_CI_STATUSES),
    notes: parseText(body.notes, "notes", { nullable: true }),
    completedAt: parseTimestamp(body.completed_at, "completed_at", { nullable: true }),
  };

  if (Object.values(patch).every((value) => value === undefined)) {
    throw new ApiError(
      400,
      "validation_error",
      "At least one mutable run field must be provided.",
    );
  }

  return patch;
};

const isFinalRunStatus = (status: string) => {
  return status === "succeeded" || status === "failed" || status === "cancelled";
};

app.onError((error, c) => {
  if (error instanceof ApiError) {
    return c.json(
      {
        error: {
          code: error.code,
          message: error.message,
          details: error.details ?? null,
        },
      },
      error.status,
    );
  }

  if (looksLikeDatabaseError(error)) {
    if (error.code === "23505") {
      return c.json(
        {
          error: {
            code: "conflict",
            message: error.detail ?? "The requested change conflicts with existing data.",
          },
        },
        409,
      );
    }

    if (error.code === "23503") {
      return c.json(
        {
          error: {
            code: "foreign_key_violation",
            message: error.detail ?? "A referenced record does not exist.",
          },
        },
        400,
      );
    }
  }

  console.error(error);

  return c.json(
    {
      error: {
        code: "internal_error",
        message: "Internal server error.",
      },
    },
    500,
  );
});

app.notFound((c) => {
  return c.json(
    {
      error: {
        code: "not_found",
        message: "Route not found.",
      },
    },
    404,
  );
});

app.get("/", (c) => {
  return c.json({
    name: "drydock-api",
    status: "ok",
  });
});

app.get("/health", async (c) => {
  await checkDatabase();

  return c.json({
    status: "ok",
    database: "reachable",
  });
});

app.post("/items", async (c) => {
  const body = parseCreateItemBody(await parseJsonBody(c));
  const actor = getActor(c);

  const item = await runInTransaction(actor, async (tx) => {
    await validateParent(tx, body.parentId);

    const [created] = await tx
      .insert(items)
      .values({
        title: body.title,
        status: body.status,
        priority: body.priority,
        description: body.description,
        parentId: body.parentId,
        createdBy: actor,
        updatedBy: actor,
      })
      .returning();

    return created;
  });

  const serialized = serializeItem(item);
  broadcast("item.created", serialized);
  return respond(c, serialized, 201);
});

app.get("/items", async (c) => {
  const status = c.req.query("status");
  const priority = c.req.query("priority");
  const tag = c.req.query("tag");
  const parentId = parseQueryId(c.req.query("parent_id"), "parent_id", {
    nullableKeyword: true,
  });
  const createdBy = c.req.query("created_by");
  const sort = parseSortField(c.req.query("sort"));
  const direction = parseSortDirection(c.req.query("direction"), sort);
  const limit = parseLimit(c.req.query("limit"));
  const offset = parseOffset(c.req.query("offset"));

  if (status !== undefined && !ITEM_STATUSES.has(status)) {
    throw new ApiError(
      400,
      "validation_error",
      `status must be one of: ${Array.from(ITEM_STATUSES).join(", ")}.`,
    );
  }

  if (priority !== undefined && !ITEM_PRIORITIES.has(priority)) {
    throw new ApiError(
      400,
      "validation_error",
      `priority must be one of: ${Array.from(ITEM_PRIORITIES).join(", ")}.`,
    );
  }

  const filters: SQL[] = [];

  if (status !== undefined) {
    filters.push(eq(items.status, status));
  }

  if (priority !== undefined) {
    filters.push(eq(items.priority, priority));
  }

  if (parentId === null) {
    filters.push(isNull(items.parentId));
  } else if (parentId !== undefined) {
    filters.push(eq(items.parentId, parentId));
  }

  if (createdBy !== undefined) {
    filters.push(eq(items.createdBy, createdBy));
  }

  if (tag !== undefined) {
    if (/^\d+$/.test(tag)) {
      const tagId = Number.parseInt(tag, 10);
      filters.push(
        exists(
          db
            .select({ value: sql`1` })
            .from(itemTags)
            .where(and(eq(itemTags.itemId, items.id), eq(itemTags.tagId, tagId))),
        ),
      );
    } else {
      filters.push(
        exists(
          db
            .select({ value: sql`1` })
            .from(itemTags)
            .innerJoin(tags, eq(itemTags.tagId, tags.id))
            .where(and(eq(itemTags.itemId, items.id), eq(tags.name, tag))),
        ),
      );
    }
  }

  const whereClause = filters.length > 0 ? and(...filters) : undefined;
  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(items)
      .where(whereClause)
      .orderBy(...getItemOrder(sort, direction))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(items).where(whereClause),
  ]);

  return c.json({
    data: rows.map(serializeItem),
    pagination: {
      limit,
      offset,
      total: Number(totalRows[0]?.total ?? 0),
    },
  });
});

app.get("/items/:id", async (c) => {
  const id = parseId(c.req.param("id"), "id");
  const item = await requireItem(db, id);

  return respond(c, await serializeDetailedItem(db, item));
});

app.patch("/items/:id", async (c) => {
  const id = parseId(c.req.param("id"), "id");
  const patch = parsePatchItemBody(await parseJsonBody(c));
  const actor = getActor(c);

  const item = await runInTransaction(actor, async (tx) => {
    await requireItem(tx, id);
    await validateParent(tx, patch.parentId, id);

    const [updated] = await tx
      .update(items)
      .set({
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.parentId !== undefined ? { parentId: patch.parentId } : {}),
        updatedBy: actor,
        updatedAt: new Date(),
      })
      .where(eq(items.id, id))
      .returning();

    return updated;
  });

  const serialized = serializeItem(item);
  broadcast("item.updated", serialized);
  return respond(c, serialized);
});

app.delete("/items/:id", async (c) => {
  const id = parseId(c.req.param("id"), "id");
  const actor = getActor(c);

  const item = await runInTransaction(actor, async (tx) => {
    await requireItem(tx, id);

    const [updated] = await tx
      .update(items)
      .set({
        status: "dead",
        updatedBy: actor,
        updatedAt: new Date(),
      })
      .where(eq(items.id, id))
      .returning();

    return updated;
  });

  const serialized = serializeItem(item);
  broadcast("item.updated", serialized);
  return respond(c, serialized);
});

app.get("/items/:id/children", async (c) => {
  const id = parseId(c.req.param("id"), "id");
  await requireItem(db, id);

  const children = await db
    .select()
    .from(items)
    .where(eq(items.parentId, id))
    .orderBy(desc(items.createdAt), desc(items.id));

  return respond(c, children.map(serializeItem));
});

app.get("/items/:id/changelog", async (c) => {
  const id = parseId(c.req.param("id"), "id");
  await requireItem(db, id);

  const entries = await db
    .select()
    .from(changelog)
    .where(eq(changelog.itemId, id))
    .orderBy(desc(changelog.changedAt), desc(changelog.id));

  return respond(c, entries.map(serializeChangelog));
});

app.post("/items/:id/dependencies", async (c) => {
  const itemId = parseId(c.req.param("id"), "id");
  const actor = getActor(c);
  const body = parseCreateDependencyBody(await parseJsonBody(c));

  const dependency = await runInTransaction(actor, async (tx) => {
    await requireItem(tx, itemId);
    const dependsOn = await requireItem(tx, body.dependsOnId);

    if (itemId === body.dependsOnId) {
      throw new ApiError(
        400,
        "invalid_dependency",
        "An item cannot depend on itself.",
      );
    }

    await assertNoCircularDependency(tx, itemId, body.dependsOnId);

    await tx
      .insert(itemDependencies)
      .values({
        itemId,
        dependsOnId: body.dependsOnId,
      })
      .onConflictDoNothing();

    return serializeDetailedItem(tx, dependsOn, 1);
  });

  broadcast("dependency.created", { item_id: itemId, depends_on_id: body.dependsOnId });
  return respond(c, dependency, 201);
});

app.delete("/items/:id/dependencies/:dependsOnId", async (c) => {
  const itemId = parseId(c.req.param("id"), "id");
  const dependsOnId = parseId(c.req.param("dependsOnId"), "dependsOnId");
  const actor = getActor(c);

  await runInTransaction(actor, async (tx) => {
    await requireItem(tx, itemId);
    await requireItem(tx, dependsOnId);

    const deleted = await tx
      .delete(itemDependencies)
      .where(
        and(
          eq(itemDependencies.itemId, itemId),
          eq(itemDependencies.dependsOnId, dependsOnId),
        ),
      )
      .returning();

    if (deleted.length === 0) {
      throw new ApiError(
        404,
        "item_dependency_not_found",
        `Item ${itemId} does not depend on item ${dependsOnId}.`,
      );
    }
  });

  broadcast("dependency.removed", { item_id: itemId, depends_on_id: dependsOnId });
  return c.body(null, 204);
});

app.get("/items/:id/dependencies", async (c) => {
  const itemId = parseId(c.req.param("id"), "id");
  await requireItem(db, itemId);

  const dependencies = await listDependencyItems(db, itemId);

  return respond(
    c,
    await Promise.all(
      dependencies.map((dependency) => serializeDetailedItem(db, dependency, 1)),
    ),
  );
});

app.get("/items/:id/dependents", async (c) => {
  const itemId = parseId(c.req.param("id"), "id");
  await requireItem(db, itemId);

  const dependents = await listDependentItems(db, itemId);

  return respond(
    c,
    await Promise.all(
      dependents.map((dependent) => serializeDetailedItem(db, dependent, 1)),
    ),
  );
});

app.post("/items/:id/tags", async (c) => {
  const itemId = parseId(c.req.param("id"), "id");
  const actor = getActor(c);
  const body = parseAssignTagBody(await parseJsonBody(c));

  const tag = await runInTransaction(actor, async (tx) => {
    await requireItem(tx, itemId);

    const resolvedTag =
      body.tagId !== undefined
        ? await requireTag(tx, body.tagId)
        : await findTagByName(tx, body.tagName as string);

    if (!resolvedTag) {
      throw new ApiError(
        404,
        "tag_not_found",
        `Tag ${body.tagName as string} was not found.`,
      );
    }

    await tx
      .insert(itemTags)
      .values({
        itemId,
        tagId: resolvedTag.id,
      })
      .onConflictDoNothing();

    return resolvedTag;
  });

  broadcast("item.updated", { item_id: itemId, tag: serializeTag(tag) });
  return c.json(
    {
      data: {
        item_id: itemId,
        tag: serializeTag(tag),
      },
    },
    201,
  );
});

app.delete("/items/:id/tags/:tagId", async (c) => {
  const itemId = parseId(c.req.param("id"), "id");
  const tagId = parseId(c.req.param("tagId"), "tagId");
  const actor = getActor(c);

  await runInTransaction(actor, async (tx) => {
    await requireItem(tx, itemId);
    await requireTag(tx, tagId);

    const deleted = await tx
      .delete(itemTags)
      .where(and(eq(itemTags.itemId, itemId), eq(itemTags.tagId, tagId)))
      .returning();

    if (deleted.length === 0) {
      throw new ApiError(
        404,
        "item_tag_not_found",
        `Tag ${tagId} is not assigned to item ${itemId}.`,
      );
    }
  });

  broadcast("item.updated", { item_id: itemId, tag_id: tagId });
  return c.body(null, 204);
});

app.get("/tags", async (c) => {
  const rows = await db.select().from(tags).orderBy(asc(tags.name), asc(tags.id));
  return respond(c, rows.map(serializeTag));
});

app.get("/tags/:id", async (c) => {
  const id = parseId(c.req.param("id"), "id");
  const tag = await requireTag(db, id);
  return respond(c, serializeTag(tag));
});

app.post("/tags", async (c) => {
  const actor = getActor(c);
  const body = parseCreateTagBody(await parseJsonBody(c));

  const tag = await runInTransaction(actor, async (tx) => {
    const [created] = await tx
      .insert(tags)
      .values({
        name: body.name,
        color: body.color,
      })
      .returning();

    return created;
  });

  const serialized = serializeTag(tag);
  broadcast("tag.created", serialized);
  return respond(c, serialized, 201);
});

app.patch("/tags/:id", async (c) => {
  const id = parseId(c.req.param("id"), "id");
  const actor = getActor(c);
  const patch = parsePatchTagBody(await parseJsonBody(c));

  const tag = await runInTransaction(actor, async (tx) => {
    await requireTag(tx, id);

    const [updated] = await tx
      .update(tags)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.color !== undefined ? { color: patch.color } : {}),
        updatedAt: new Date(),
      })
      .where(eq(tags.id, id))
      .returning();

    return updated;
  });

  const serialized = serializeTag(tag);
  broadcast("tag.updated", serialized);
  return respond(c, serialized);
});

app.delete("/tags/:id", async (c) => {
  const id = parseId(c.req.param("id"), "id");
  const actor = getActor(c);

  await runInTransaction(actor, async (tx) => {
    await requireTag(tx, id);
    await tx.delete(tags).where(eq(tags.id, id));
  });

  broadcast("tag.deleted", { id });
  return c.body(null, 204);
});

app.get("/items/:id/runs", async (c) => {
  const itemId = parseId(c.req.param("id"), "id");
  const limit = parseLimit(c.req.query("limit"));
  const offset = parseOffset(c.req.query("offset"));

  await requireItem(db, itemId);

  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.itemId, itemId))
      .orderBy(desc(agentRuns.startedAt), desc(agentRuns.id))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(agentRuns).where(eq(agentRuns.itemId, itemId)),
  ]);

  return c.json({
    data: rows.map(serializeRun),
    pagination: {
      limit,
      offset,
      total: Number(totalRows[0]?.total ?? 0),
    },
  });
});

app.post("/items/:id/runs", async (c) => {
  const itemId = parseId(c.req.param("id"), "id");
  const actor = getActor(c);
  const body = parseCreateRunBody(await parseJsonBody(c));

  const run = await runInTransaction(actor, async (tx) => {
    await requireItem(tx, itemId);

    const completedAt =
      body.completedAt !== undefined
        ? body.completedAt
        : isFinalRunStatus(body.status)
          ? new Date()
          : null;

    const [created] = await tx
      .insert(agentRuns)
      .values({
        itemId,
        agent: body.agent,
        branch: body.branch,
        status: body.status,
        prUrl: body.prUrl,
        ciStatus: body.ciStatus,
        notes: body.notes,
        completedAt,
      })
      .returning();

    return created;
  });

  const serializedRun = serializeRun(run);
  broadcast("run.created", serializedRun);
  return respond(c, serializedRun, 201);
});

app.patch("/runs/:id", async (c) => {
  const id = parseId(c.req.param("id"), "id");
  const actor = getActor(c);
  const patch = parsePatchRunBody(await parseJsonBody(c));

  const run = await runInTransaction(actor, async (tx) => {
    const existing = await requireRun(tx, id);
    const nextStatus = patch.status ?? existing.status;
    const completedAt =
      patch.completedAt !== undefined
        ? patch.completedAt
        : existing.completedAt ?? (isFinalRunStatus(nextStatus) ? new Date() : null);

    const [updated] = await tx
      .update(agentRuns)
      .set({
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.branch !== undefined ? { branch: patch.branch } : {}),
        ...(patch.prUrl !== undefined ? { prUrl: patch.prUrl } : {}),
        ...(patch.ciStatus !== undefined ? { ciStatus: patch.ciStatus } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
        completedAt,
        updatedAt: new Date(),
      })
      .where(eq(agentRuns.id, id))
      .returning();

    return updated;
  });

  const serializedRun = serializeRun(run);
  broadcast("run.updated", serializedRun);
  return respond(c, serializedRun);
});

await checkDatabase();

serve({
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(req);
      if (!upgraded) {
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      return undefined;
    }
    return app.fetch(req, server);
  },
  websocket: {
    open(ws) {
      addClient(ws);
    },
    close(ws) {
      removeClient(ws);
    },
    message() {
      // Client messages are ignored — server push only
    },
  },
  port: config.apiPort,
});

console.log(`drydock-api listening on http://0.0.0.0:${config.apiPort}`);
