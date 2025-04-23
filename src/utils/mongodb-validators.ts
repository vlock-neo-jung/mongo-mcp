import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { logger } from "./logger.js";
import { z } from "zod";

/**
 * MongoDB 파라미터 검증 유틸리티
 * 모든 도구에서 공통적으로 사용되는 파라미터 검증 로직을 제공합니다.
 */

/**
 * 필터 쿼리 파싱 및 검증
 * 문자열 또는 객체 형태의 필터를 검증하고 MongoDB 쿼리 형태로 반환합니다.
 */
export function validateFilter(
  filter: Record<string, unknown> | string | undefined,
  toolName: string
): Record<string, unknown> {
  if (!filter) {
    return {};
  }

  try {
    let parsedFilter: Record<string, unknown>;
    
    if (typeof filter === "string") {
      try {
        parsedFilter = JSON.parse(filter);
        if (typeof parsedFilter !== "object" || parsedFilter === null || Array.isArray(parsedFilter)) {
          throw new Error("Filter must be a valid JSON object");
        }
      } catch (error) {
        const errorMessage = `Invalid filter JSON: ${error instanceof Error ? error.message : String(error)}`;
        logger.warn(errorMessage, { toolName, filter });
        throw new McpError(ErrorCode.InvalidRequest, errorMessage);
      }
    } else {
      parsedFilter = filter;
    }

    return parsedFilter;
  } catch (error) {
    const errorMessage = `Invalid filter: ${error instanceof Error ? error.message : String(error)}`;
    logger.warn(errorMessage, { toolName, filter });
    throw new McpError(ErrorCode.InvalidRequest, errorMessage);
  }
}

/**
 * 프로젝션 검증
 * 프로젝션 객체를 검증하고 MongoDB 형식으로 반환합니다.
 * 프로젝션은 필드를 포함(1) 또는 제외(0)하는 객체입니다.
 */
export function validateProjection(
  projection: Record<string, unknown> | string | undefined,
  toolName: string
): Record<string, 0 | 1 | boolean> {
  if (!projection) {
    return {};
  }

  try {
    let parsedProjection: Record<string, unknown>;
    
    if (typeof projection === "string") {
      try {
        parsedProjection = JSON.parse(projection);
        if (typeof parsedProjection !== "object" || parsedProjection === null || Array.isArray(parsedProjection)) {
          throw new Error("Projection must be a valid JSON object");
        }
      } catch (error) {
        const errorMessage = `Invalid projection JSON: ${error instanceof Error ? error.message : String(error)}`;
        logger.warn(errorMessage, { toolName, projection });
        throw new McpError(ErrorCode.InvalidRequest, errorMessage);
      }
    } else {
      parsedProjection = projection;
    }

    // 프로젝션 값 검증 (0, 1, true, false만 허용)
    const result: Record<string, 0 | 1 | boolean> = {};
    for (const [key, value] of Object.entries(parsedProjection)) {
      if (value === 0 || value === 1 || value === true || value === false) {
        result[key] = value;
      } else {
        const errorMessage = `Invalid projection value for field '${key}': ${String(value)}. Must be 0, 1, true, or false.`;
        logger.warn(errorMessage, { toolName, projection });
        throw new McpError(ErrorCode.InvalidRequest, errorMessage);
      }
    }

    return result;
  } catch (error) {
    const errorMessage = `Invalid projection: ${error instanceof Error ? error.message : String(error)}`;
    logger.warn(errorMessage, { toolName, projection });
    throw new McpError(ErrorCode.InvalidRequest, errorMessage);
  }
}

/**
 * 정렬 검증
 * 정렬 객체를 검증하고 MongoDB 형식으로 반환합니다.
 * 정렬은 필드와 방향(1: 오름차순, -1: 내림차순)을 지정하는 객체입니다.
 */
export function validateSort(
  sort: Record<string, unknown> | string | undefined,
  toolName: string
): Record<string, 1 | -1> {
  if (!sort) {
    return {};
  }

  try {
    let parsedSort: Record<string, unknown>;
    
    if (typeof sort === "string") {
      try {
        parsedSort = JSON.parse(sort);
        if (typeof parsedSort !== "object" || parsedSort === null || Array.isArray(parsedSort)) {
          throw new Error("Sort must be a valid JSON object");
        }
      } catch (error) {
        const errorMessage = `Invalid sort JSON: ${error instanceof Error ? error.message : String(error)}`;
        logger.warn(errorMessage, { toolName, sort });
        throw new McpError(ErrorCode.InvalidRequest, errorMessage);
      }
    } else {
      parsedSort = sort;
    }

    // 정렬 값 검증 (1, -1, "asc", "desc", "ascending", "descending"만 허용)
    const result: Record<string, 1 | -1> = {};
    for (const [key, value] of Object.entries(parsedSort)) {
      if (value === 1 || value === -1) {
        result[key] = value;
      } else if (value === "asc" || value === "ascending") {
        result[key] = 1;
      } else if (value === "desc" || value === "descending") {
        result[key] = -1;
      } else {
        const errorMessage = `Invalid sort value for field '${key}': ${String(value)}. Must be 1, -1, "asc", "desc", "ascending", or "descending".`;
        logger.warn(errorMessage, { toolName, sort });
        throw new McpError(ErrorCode.InvalidRequest, errorMessage);
      }
    }

    return result;
  } catch (error) {
    const errorMessage = `Invalid sort: ${error instanceof Error ? error.message : String(error)}`;
    logger.warn(errorMessage, { toolName, sort });
    throw new McpError(ErrorCode.InvalidRequest, errorMessage);
  }
}

/**
 * 시스템 컬렉션 접근 검증
 * system으로 시작하는 컬렉션은 시스템 컬렉션으로 간주하고 접근을 방지합니다.
 */
export function validateSystemCollection(
  collection: string,
  toolName: string
): void {
  // 시스템 컬렉션 접근 방지 (system. 또는 .으로 시작하는 컬렉션)
  if (collection.startsWith("system.") || collection.startsWith(".")) {
    const errorMessage = `Access to system collection '${collection}' is not allowed`;
    logger.warn(errorMessage, { toolName });
    throw new McpError(ErrorCode.InvalidRequest, errorMessage);
  }
}

/**
 * 집계 파이프라인 검증
 * 집계 파이프라인 배열을 검증하고 MongoDB 형식으로 반환합니다.
 */
export function validateAggregatePipeline(
  pipeline: unknown,
  toolName: string
): Array<Record<string, unknown>> {
  if (!Array.isArray(pipeline)) {
    const errorMessage = "Pipeline must be an array";
    logger.warn(errorMessage, { toolName, pipelineType: typeof pipeline });
    throw new McpError(ErrorCode.InvalidRequest, errorMessage);
  }

  if (pipeline.length === 0) {
    const errorMessage = "Aggregation pipeline cannot be empty";
    logger.warn(errorMessage, { toolName });
    throw new McpError(ErrorCode.InvalidRequest, errorMessage);
  }

  for (const stage of pipeline) {
    if (typeof stage !== "object" || stage === null || Array.isArray(stage)) {
      const errorMessage = "Each pipeline stage must be an object";
      logger.warn(errorMessage, { 
        toolName, 
        stageType: typeof stage, 
        isNull: stage === null, 
        isArray: Array.isArray(stage) 
      });
      throw new McpError(ErrorCode.InvalidRequest, errorMessage);
    }

    const stageKeys = Object.keys(stage);
    if (stageKeys.length === 0) {
      const errorMessage = "Pipeline stage cannot be empty";
      logger.warn(errorMessage, { toolName });
      throw new McpError(ErrorCode.InvalidRequest, errorMessage);
    }

    // 스테이지는 보통 $로 시작하는 연산자를 포함해야 함
    if (!stageKeys.some(key => key.startsWith("$"))) {
      const errorMessage = `Pipeline stage must contain an operator starting with $: ${JSON.stringify(stage)}`;
      logger.warn(errorMessage, { toolName, stageKeys });
      throw new McpError(ErrorCode.InvalidRequest, errorMessage);
    }
  }

  return pipeline as Array<Record<string, unknown>>;
}

/**
 * 업데이트 연산자 검증
 * 업데이트 객체를 검증하고 MongoDB 형식으로 반환합니다.
 * $set, $unset 등의 연산자가 없는 경우 $set으로 감싸줍니다.
 */
export function validateUpdateOperation(
  update: unknown,
  toolName: string
): Record<string, unknown> {
  if (!update || typeof update !== "object" || Array.isArray(update)) {
    const errorMessage = "Update must be a valid MongoDB update document";
    logger.warn(errorMessage, { toolName, updateType: typeof update });
    throw new McpError(ErrorCode.InvalidRequest, errorMessage);
  }
  
  const updateObj = update as Record<string, unknown>;
  
  // 유효한 업데이트 연산자 목록
  const validUpdateOperators = [
    "$set", "$unset", "$inc", "$push", "$pull", 
    "$addToSet", "$pop", "$rename", "$mul", "$min", 
    "$max", "$currentDate", "$pullAll"
  ];
  
  const hasValidOperator = Object.keys(updateObj).some(key => 
    validUpdateOperators.includes(key)
  );
  
  if (!hasValidOperator) {
    // 유효한 연산자가 없으면 $set으로 감싸기
    logger.debug("No update operators found, wrapping with $set operator", { 
      toolName, 
      providedKeys: Object.keys(updateObj)
    });
    return { $set: updateObj };
  }
  
  return updateObj;
}

/**
 * 필드 이름 검증
 * 필드 이름이 유효한 문자열인지 확인합니다.
 */
export function validateField(
  field: unknown,
  toolName: string
): string {
  if (typeof field !== "string" || field.trim() === "") {
    const errorMessage = "Field name must be a non-empty string";
    logger.warn(errorMessage, { toolName, field });
    throw new McpError(ErrorCode.InvalidRequest, errorMessage);
  }
  return field;
}

/**
 * 옵션 객체에서 undefined 값 제거
 * MongoDB 옵션 객체에서 undefined 값을 가진 속성을 제거합니다.
 */
export function cleanOptions(options: Record<string, unknown>): Record<string, unknown> {
  const cleanedOptions: Record<string, unknown> = {};
  
  if (options.limit !== undefined) {
    const limit = Number(options.limit);
    if (!isNaN(limit) && limit >= 0) {
      cleanedOptions.limit = limit;
    }
  }
  
  if (options.skip !== undefined) {
    const skip = Number(options.skip);
    if (!isNaN(skip) && skip >= 0) {
      cleanedOptions.skip = skip;
    }
  }
  
  return cleanedOptions;
}

// MongoDB 쿼리 연산자에 대한 Zod 스키마
export const MongoQueryOperators = z.object({
  $eq: z.any().optional(),
  $gt: z.any().optional(),
  $gte: z.any().optional(),
  $in: z.array(z.any()).optional(),
  $lt: z.any().optional(),
  $lte: z.any().optional(),
  $ne: z.any().optional(),
  $nin: z.array(z.any()).optional(),
  $and: z.array(z.any()).optional(),
  $not: z.any().optional(),
  $nor: z.array(z.any()).optional(),
  $or: z.array(z.any()).optional(),
  $exists: z.boolean().optional(),
  $type: z.union([z.string(), z.number()]).optional(),
  $expr: z.any().optional(),
  $jsonSchema: z.any().optional(),
  $mod: z.tuple([z.number(), z.number()]).optional(),
  $regex: z.string().optional(),
  $options: z.string().optional(),
  $text: z.any().optional(),
  $where: z.any().optional(),
  $all: z.array(z.any()).optional(),
  $elemMatch: z.any().optional(),
  $size: z.number().optional(),
  $bitsAllClear: z.any().optional(),
  $bitsAllSet: z.any().optional(),
  $bitsAnyClear: z.any().optional(),
  $bitsAnySet: z.any().optional(),
});

// MongoDB 프로젝션 값을 위한 Zod 스키마
export const MongoProjectionValueSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(true),
  z.literal(false)
]);

// MongoDB 필터 파라미터를 위한 Zod 스키마
export const MongoFilterSchema = z.union([
  z.record(z.any()),
  z.string()
]);

// MongoDB 프로젝션 파라미터를 위한 Zod 스키마
export const MongoProjectionSchema = z.union([
  z.record(MongoProjectionValueSchema),
  z.string()
]);

// MongoDB 정렬 값을 위한 Zod 스키마
export const MongoSortValueSchema = z.union([
  z.literal(1),
  z.literal(-1),
  z.literal("asc"),
  z.literal("desc"),
  z.literal("ascending"),
  z.literal("descending")
]);

// MongoDB 정렬 파라미터를 위한 Zod 스키마
export const MongoSortParamSchema = z.union([
  z.record(MongoSortValueSchema),
  z.string()
]); 