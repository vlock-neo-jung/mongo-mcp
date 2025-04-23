import { Collection } from "mongodb";
import { z } from "zod";
import { MongoErrorCode, MongoErrorSchema } from "./errors.js";

// Legacy Interface Definitions
export interface MongoFieldSchema {
  field: string;
  type: string;
  isRequired: boolean;
  subFields?: MongoFieldSchema[];
}

export interface MongoCollectionSchema {
  collection: string;
  fields: MongoFieldSchema[];
  count: number;
  indexes?: unknown[];
}

export function inferSchemaFromValue(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (value instanceof Date) return "date";
  if (typeof value === "object") return "object";
  return typeof value;
}

export function inferSchemaFromDocument(
  doc: Record<string, unknown>,
  parentPath = ""
): MongoFieldSchema[] {
  const schema: MongoFieldSchema[] = [];

  for (const [key, value] of Object.entries(doc)) {
    const fieldPath = parentPath ? `${parentPath}.${key}` : key;
    const fieldType = inferSchemaFromValue(value);
    const field: MongoFieldSchema = {
      field: fieldPath,
      type: fieldType,
      isRequired: true,
    };

    if (fieldType === "object" && value !== null) {
      field.subFields = inferSchemaFromDocument(
        value as Record<string, unknown>,
        fieldPath
      );
    } else if (
      fieldType === "array" &&
      Array.isArray(value) &&
      value.length > 0
    ) {
      const arrayType = inferSchemaFromValue(value[0]);
      if (arrayType === "object") {
        field.subFields = inferSchemaFromDocument(
          value[0] as Record<string, unknown>,
          `${fieldPath}[]`
        );
      }
    }
    schema.push(field);
  }
  return schema;
}

export async function buildCollectionSchema(
  collection: Collection,
  sampleSize = 100
): Promise<MongoCollectionSchema> {
  const docs = (await collection
    .find({})
    .limit(sampleSize)
    .toArray()) as Record<string, unknown>[];
  const count = await collection.countDocuments();
  const indexes = await collection.indexes();

  const fieldSchemas = new Map<string, Set<string>>();
  const requiredFields = new Set<string>();

  docs.forEach((doc) => {
    const docSchema = inferSchemaFromDocument(doc);
    docSchema.forEach((field) => {
      if (!fieldSchemas.has(field.field)) {
        fieldSchemas.set(field.field, new Set());
      }
      fieldSchemas.get(field.field)!.add(field.type);
      requiredFields.add(field.field);
    });
  });

  docs.forEach((doc) => {
    const docFields = new Set(Object.keys(doc));
    for (const field of requiredFields) {
      if (!docFields.has(field.split(".")[0])) {
        requiredFields.delete(field);
      }
    }
  });

  const fields: MongoFieldSchema[] = Array.from(fieldSchemas.entries()).map(
    ([field, types]) => ({
      field,
      type:
        types.size === 1
          ? types.values().next().value
          : Array.from(types).join("|"),
      isRequired: requiredFields.has(field),
      subFields: undefined,
    })
  );

  for (const doc of docs) {
    const docSchema = inferSchemaFromDocument(doc);
    docSchema.forEach((fieldSchema) => {
      if (fieldSchema.subFields) {
        const existingField = fields.find((f) => f.field === fieldSchema.field);
        if (existingField && !existingField.subFields) {
          existingField.subFields = fieldSchema.subFields;
        }
      }
    });
  }

  return {
    collection: collection.collectionName,
    fields,
    count,
    indexes,
  };
}

// Zod Schema Definitions
// MongoDB Collection Zod Schema
export const ZodMongoCollectionSchema = z.object({
  collectionName: z.string(),
  databaseName: z.string(),
  indexes: z
    .array(
      z.object({
        name: z.string(),
        keys: z.record(z.union([z.number(), z.string()])),
        unique: z.optional(z.boolean()),
      })
    )
    .optional(),
});

export type ZodMongoCollection = z.infer<typeof ZodMongoCollectionSchema>;

// MongoDB Document Zod Schema
export const ZodMongoDocumentSchema = z.object({
  document: z.record(z.unknown()),
});

export type ZodMongoDocument = z.infer<typeof ZodMongoDocumentSchema>;

// MongoDB Query Operators
export const MongoQueryOperatorSchema = z.object({
  $eq: z.unknown().optional(),
  $gt: z.unknown().optional(),
  $gte: z.unknown().optional(),
  $in: z.array(z.unknown()).optional(),
  $lt: z.unknown().optional(),
  $lte: z.unknown().optional(),
  $ne: z.unknown().optional(),
  $nin: z.array(z.unknown()).optional(),
  $and: z.array(z.unknown()).optional(),
  $not: z.unknown().optional(),
  $nor: z.array(z.unknown()).optional(),
  $or: z.array(z.unknown()).optional(),
  $exists: z.boolean().optional(),
  $type: z.union([z.string(), z.number()]).optional(),
  $expr: z.unknown().optional(),
  $regex: z.string().optional(),
  $options: z.string().optional(),
});

export type MongoQueryOperator = z.infer<typeof MongoQueryOperatorSchema>;

// MongoDB Sort Options
export const MongoSortSchema = z.record(z.union([z.literal(1), z.literal(-1)]));

export type MongoSort = z.infer<typeof MongoSortSchema>;

// MongoDB Update Operators
export const MongoUpdateOperatorSchema = z.object({
  $set: z.record(z.unknown()).optional(),
  $unset: z.record(z.unknown()).optional(),
  $inc: z.record(z.number()).optional(),
  $mul: z.record(z.number()).optional(),
  $rename: z.record(z.string()).optional(),
  $min: z.record(z.unknown()).optional(),
  $max: z.record(z.unknown()).optional(),
  $currentDate: z.record(z.union([z.boolean(), z.object({ $type: z.literal("timestamp") })])).optional(),
  $addToSet: z.record(z.unknown()).optional(),
  $pop: z.record(z.union([z.literal(1), z.literal(-1)])).optional(),
  $pull: z.record(z.unknown()).optional(),
  $push: z.record(z.unknown()).optional(),
  $pullAll: z.record(z.array(z.unknown())).optional(),
});

export type MongoUpdateOperator = z.infer<typeof MongoUpdateOperatorSchema>;

// MongoDB Aggregate Pipeline Stage
export const MongoAggregateStageSchema = z.record(z.unknown());
export type MongoAggregateStage = z.infer<typeof MongoAggregateStageSchema>;

// MongoDB Aggregate Pipeline
export const MongoAggregatePipelineSchema = z.array(MongoAggregateStageSchema);
export type MongoAggregatePipeline = z.infer<typeof MongoAggregatePipelineSchema>;

// MongoDB Schema Inference Types
export const ZodMongoFieldSchemaSchema = z.lazy(() => 
  z.object({
    type: z.union([
      z.literal("string"),
      z.literal("number"),
      z.literal("boolean"),
      z.literal("date"),
      z.literal("objectId"),
      z.literal("array"),
      z.literal("object"),
      z.literal("null"),
      z.literal("mixed"),
    ]),
    required: z.boolean().optional(),
    unique: z.boolean().optional(),
    indexed: z.boolean().optional(),
    items: ZodMongoFieldSchemaSchema.optional(),
    properties: z.record(ZodMongoFieldSchemaSchema).optional(),
  })
);

export type ZodMongoFieldSchema = z.infer<typeof ZodMongoFieldSchemaSchema>;

export const ZodMongoCollectionSchemaSchema = z.object({
  name: z.string(),
  fields: z.record(ZodMongoFieldSchemaSchema),
  options: z
    .object({
      timestamps: z.boolean().optional(),
      strict: z.boolean().optional(),
    })
    .optional(),
});

export type ZodMongoCollectionSchema = z.infer<typeof ZodMongoCollectionSchemaSchema>;
