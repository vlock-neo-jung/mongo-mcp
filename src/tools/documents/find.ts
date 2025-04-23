import { db } from "../../mongodb/client.js";
import { BaseTool, ToolParams, ToolResponse } from "../base/tool.js";
import { MongoQueryOperator, MongoSort } from "../../mongodb/schema.js";
import { logger } from "../../utils/logger.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

export interface FindParams extends ToolParams {
  collection: string;
  filter?: Record<string, unknown> | string | {
    field: string;
    value: unknown;
    operator: string;
  };
  projection?: Record<string, 0 | 1>;
  limit?: number;
  skip?: number;
  sort?: MongoSort;
}

export class FindTool extends BaseTool<FindParams> {
  name = "query";
  description = "Query documents in a collection using MongoDB query syntax";
  inputSchema = {
    type: "object" as const,
    properties: {
      collection: {
        type: "string",
        description: "Name of the collection to query",
      },
      filter: {
        type: ["object", "string"],
        description: "MongoDB query filter with operators like $gt, $lt, $in, etc. Can be a JSON string or object",
        default: {},
      },
      projection: {
        type: "object",
        description: "Fields to include (1) or exclude (0)",
        default: {},
      },
      limit: {
        type: "number",
        description: "Maximum documents to return",
        default: 100,
        minimum: 1,
        maximum: 1000,
      },
      skip: {
        type: "number",
        description: "Number of documents to skip",
        default: 0,
        minimum: 0,
      },
      sort: {
        type: "object",
        description: "Sort order: 1 for ascending, -1 for descending",
        default: {},
      },
    },
    required: ["collection"],
  };

  async execute(params: FindParams): Promise<ToolResponse> {
    try {
      const collection = this.validateCollection(params.collection);
      
      // 시스템 컬렉션 접근 방지
      if (collection.startsWith("system.")) {
        const errorMessage = "Access to system collections is not allowed";
        logger.warn(errorMessage, { toolName: this.name, collection });
        throw new McpError(ErrorCode.InvalidRequest, errorMessage);
      }

      // 필터 파싱 및 검증
      let queryFilter: Record<string, unknown> = {};
      if (params.filter) {
        if (typeof params.filter === "string") {
          try {
            queryFilter = JSON.parse(params.filter);
          } catch (e) {
            const errorMessage = "Invalid filter format: must be a valid JSON object";
            logger.warn(errorMessage, { toolName: this.name, filter: params.filter });
            throw new McpError(ErrorCode.InvalidRequest, errorMessage);
          }
        } else if (
          typeof params.filter === "object" && 
          params.filter !== null && 
          !Array.isArray(params.filter)
        ) {
          // 구조화된 필터 확인 (field, value, operator 속성 포함)
          if (
            'field' in params.filter && 
            typeof params.filter.field === 'string' &&
            'value' in params.filter &&
            'operator' in params.filter && 
            typeof params.filter.operator === 'string'
          ) {
            // MongoDB 쿼리 형식으로 변환
            if (params.filter.operator === "$eq") {
              // $eq 연산자는 단순화 가능
              queryFilter = { [params.filter.field]: params.filter.value };
            } else {
              queryFilter = {
                [params.filter.field]: { [params.filter.operator]: params.filter.value }
              };
            }
          } else {
            // 이미 MongoDB 형식인 경우 직접 사용
            queryFilter = params.filter as Record<string, unknown>;
          }
        } else {
          const errorMessage = "Query filter must be a plain object or JSON string";
          logger.warn(errorMessage, { toolName: this.name, filterType: typeof params.filter });
          throw new McpError(ErrorCode.InvalidRequest, errorMessage);
        }
      }

      // 쿼리 실행
      let query = db.collection(collection).find(queryFilter);
      
      // 프로젝션 적용
      if (params.projection && Object.keys(params.projection).length > 0) {
        query = query.project(params.projection);
      }
      
      // 정렬 적용
      if (params.sort && Object.keys(params.sort).length > 0) {
        query = query.sort(params.sort);
      }
      
      // 페이징 적용
      if (typeof params.skip === 'number' && params.skip > 0) {
        query = query.skip(params.skip);
      }
      
      // 결과 제한
      const limit = Math.min(params.limit || 100, 1000);
      query = query.limit(limit);
      
      // 쿼리 실행 및 결과 반환
      const results = await query.toArray();
      
      logger.debug(`Retrieved ${results.length} documents from ${collection}`, { 
        toolName: this.name,
        collection,
        resultCount: results.length,
        limit
      });

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(results, null, 2) },
        ],
        isError: false,
      };
    } catch (error) {
      return this.handleError(error);
    }
  }
}
