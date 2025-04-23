import { db } from "../../mongodb/client.js";
import { BaseTool, ToolParams, ToolResponse } from "../base/tool.js";
import { logger } from "../../utils/logger.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

export interface CountParams extends ToolParams {
  collection: string;
  query?: Record<string, unknown> | string;
  limit?: number;
  skip?: number;
  hint?: Record<string, unknown>;
  readConcern?: Record<string, unknown>;
  maxTimeMS?: number;
  collation?: Record<string, unknown>;
}

export class CountTool extends BaseTool<CountParams> {
  name = "count";
  description = "Count the number of documents in a collection that match a query";
  
  inputSchema = {
    type: "object" as const,
    properties: {
      collection: {
        type: "string",
        description: "Name of the collection to count documents in",
      },
      query: {
        type: ["object", "string"],
        description: "Optional: Query filter to select documents to count",
      },
      limit: {
        type: "integer",
        description: "Optional: Maximum number of documents to count",
      },
      skip: {
        type: "integer",
        description: "Optional: Number of documents to skip before counting",
      },
      hint: {
        type: "object",
        description: "Optional: Index hint to force query plan",
      },
      readConcern: {
        type: "object",
        description: "Optional: Read concern for the count operation",
      },
      maxTimeMS: {
        type: "integer",
        description: "Optional: Maximum time to allow the count to run",
      },
      collation: {
        type: "object",
        description: "Optional: Collation rules for string comparison",
      },
    },
    required: ["collection"],
  };

  async execute(params: CountParams): Promise<ToolResponse> {
    try {
      const collection = this.validateCollection(params.collection);
      
      // 시스템 컬렉션 접근 방지
      if (collection.startsWith("system.")) {
        const errorMessage = "Access to system collections is not allowed";
        logger.warn(errorMessage, { toolName: this.name, collection });
        throw new McpError(ErrorCode.InvalidRequest, errorMessage);
      }

      // 쿼리 파싱 및 검증
      let countQuery: Record<string, unknown> = {};
      if (params.query) {
        if (typeof params.query === "string") {
          try {
            countQuery = JSON.parse(params.query);
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
          countQuery = params.query;
        } else {
          const errorMessage = "Query must be a plain object";
          logger.warn(errorMessage, { toolName: this.name, queryType: typeof params.query });
          throw new McpError(ErrorCode.InvalidRequest, errorMessage);
        }
      }
      
      // 옵션 설정
      const options: Record<string, any> = {};
      
      if (typeof params.limit === "number") {
        options.limit = params.limit;
      }
      
      if (typeof params.skip === "number") {
        options.skip = params.skip;
      }
      
      if (params.hint && typeof params.hint === "object") {
        options.hint = params.hint;
      }
      
      if (params.readConcern && typeof params.readConcern === "object") {
        options.readConcern = params.readConcern;
      }
      
      if (typeof params.maxTimeMS === "number") {
        options.maxTimeMS = params.maxTimeMS;
      }
      
      if (params.collation && typeof params.collation === "object") {
        options.collation = params.collation;
      }
      
      // undefined 옵션 제거
      Object.keys(options).forEach(key => options[key] === undefined && delete options[key]);
      
      // 실행
      logger.debug(`Counting documents in ${collection}`, { 
        toolName: this.name, 
        collection,
        query: countQuery,
        options
      });
      
      const count = await db.collection(collection).countDocuments(countQuery, options);
      
      logger.debug(`Count result: ${count} documents`, { 
        toolName: this.name, 
        collection,
        count
      });

      return {
        content: [
          { 
            type: "text" as const, 
            text: JSON.stringify({
              count,
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
} 