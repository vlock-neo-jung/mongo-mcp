import { db } from "../../mongodb/client.js";
import { BaseTool, ToolParams, ToolResponse } from "../base/tool.js";
import { logger } from "../../utils/logger.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

export interface DistinctParams extends ToolParams {
  collection: string;
  field: string;
  query?: Record<string, unknown> | string;
  maxTimeMS?: number;
  collation?: Record<string, unknown>;
}

export class DistinctTool extends BaseTool<DistinctParams> {
  name = "distinct";
  description = "Find the distinct values for a specified field across a collection";
  
  inputSchema = {
    type: "object" as const,
    properties: {
      collection: {
        type: "string",
        description: "Name of the collection to query",
      },
      field: {
        type: "string",
        description: "Field for which to return distinct values",
      },
      query: {
        type: ["object", "string"],
        description: "MongoDB query filter to limit the distinct operation",
      },
      maxTimeMS: {
        type: "integer",
        description: "Optional: Maximum time to allow the distinct operation to run",
      },
      collation: {
        type: "object",
        description: "Optional: Collation rules for string comparison",
      },
    },
    required: ["collection", "field"],
  };

  async execute(params: DistinctParams): Promise<ToolResponse> {
    try {
      const collection = this.validateCollection(params.collection);
      const field = this.validateField(params.field);
      
      // 시스템 컬렉션 접근 방지
      if (collection.startsWith("system.")) {
        const errorMessage = "Access to system collections is not allowed";
        logger.warn(errorMessage, { toolName: this.name, collection });
        throw new McpError(ErrorCode.InvalidRequest, errorMessage);
      }

      // 쿼리 파싱 및 검증
      let queryFilter: Record<string, unknown> = {};
      if (params.query) {
        if (typeof params.query === "string") {
          try {
            queryFilter = JSON.parse(params.query);
          } catch (e) {
            const errorMessage = "Invalid query format: must be a valid JSON object";
            logger.warn(errorMessage, { toolName: this.name, query: params.query });
            throw new McpError(ErrorCode.InvalidRequest, errorMessage);
          }
        } else if (
          typeof params.query === "object" && 
          params.query !== null && 
          !Array.isArray(params.query)
        ) {
          queryFilter = params.query;
        } else {
          const errorMessage = "Query must be a plain object";
          logger.warn(errorMessage, { toolName: this.name, queryType: typeof params.query });
          throw new McpError(ErrorCode.InvalidRequest, errorMessage);
        }
      }
      
      // 옵션 설정
      const options: Record<string, any> = {};
      
      if (typeof params.maxTimeMS === "number") {
        options.maxTimeMS = params.maxTimeMS;
      }
      
      if (params.collation && typeof params.collation === "object") {
        options.collation = params.collation;
      }
      
      // undefined 옵션 제거
      Object.keys(options).forEach(key => options[key] === undefined && delete options[key]);
      
      // 실행
      logger.debug(`Finding distinct values for field ${field} in ${collection}`, { 
        toolName: this.name, 
        collection,
        field,
        query: queryFilter,
        options
      });
      
      const values = await db.collection(collection).distinct(field, queryFilter, options);
      
      logger.debug(`Distinct operation returned ${values.length} unique values`, { 
        toolName: this.name, 
        collection,
        field,
        valueCount: values.length
      });

      return {
        content: [
          { 
            type: "text" as const, 
            text: JSON.stringify({
              values,
              count: values.length,
              field,
              ok: 1
            }, null, 2) 
          },
        ],
        isError: false,
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // 필드 이름 검증
  private validateField(field: unknown): string {
    if (typeof field !== "string" || field.trim() === "") {
      const errorMessage = "Field name must be a non-empty string";
      logger.warn(errorMessage, { toolName: this.name, field });
      throw new McpError(ErrorCode.InvalidRequest, errorMessage);
    }
    return field;
  }
} 