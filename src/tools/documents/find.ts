import { db } from "../../mongodb/client.js";
import { BaseTool, ToolParams, ToolResponse } from "../base/tool.js";
import { logger } from "../../utils/logger.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { 
  validateFilter, 
  validateProjection, 
  validateSort, 
  validateSystemCollection,
  cleanOptions 
} from "../../utils/mongodb-validators.js";

export interface FindParams extends ToolParams {
  collection: string;
  filter?: Record<string, unknown> | string;
  projection?: Record<string, unknown> | string;
  sort?: Record<string, unknown> | string;
  limit?: number;
  skip?: number;
}

export class FindTool extends BaseTool<FindParams> {
  name = "query";
  description = "Find documents in a MongoDB collection";

  inputSchema = {
    type: "object" as const,
    properties: {
      collection: {
        type: "string",
        description: "The name of the collection to find documents in",
      },
      filter: {
        type: ["object", "string"],
        description:
          "MongoDB query filter to select documents. Can be JSON string or filter object.",
      },
      projection: {
        type: ["object", "string"],
        description:
          "Fields to include or exclude from the result documents. Can be JSON string or projection object.",
      },
      sort: {
        type: ["object", "string"],
        description:
          "Sort order for result documents. Can be JSON string or sort object.",
      },
      limit: {
        type: "number",
        description: "Maximum number of documents to return",
      },
      skip: {
        type: "number",
        description: "Number of documents to skip",
      },
    },
    required: ["collection"],
  };

  async execute(params: FindParams): Promise<ToolResponse> {
    const { collection, filter, projection, sort, limit, skip } = params;

    try {
      logger.debug("Executing find operation", {
        toolName: this.name,
        collection,
        filter,
        projection,
        sort,
        limit,
        skip,
      });

      // 시스템 컬렉션 접근 방지
      validateSystemCollection(collection, this.name);

      // 필터 처리
      const parsedFilter = filter ? validateFilter(filter, this.name) : {};

      // 프로젝션 처리
      const parsedProjection = projection 
        ? validateProjection(projection, this.name) 
        : undefined;

      // 정렬 처리
      const parsedSort = sort 
        ? validateSort(sort, this.name) 
        : undefined;

      // 조회 실행
      const coll = db.collection(collection);
      const cursor = coll.find(parsedFilter, {
        projection: parsedProjection,
      });

      // 정렬, 페이징 적용
      if (parsedSort) {
        cursor.sort(parsedSort);
      }

      if (skip !== undefined && typeof skip === "number") {
        cursor.skip(skip);
      }

      if (limit !== undefined && typeof limit === "number") {
        cursor.limit(limit);
      }

      // 결과 조회
      const results = await cursor.toArray();

      logger.debug("Find operation completed successfully", {
        toolName: this.name,
        collection,
        resultCount: results.length,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(results, null, 2),
          },
        ],
        isError: false,
      };
    } catch (error) {
      logger.error("Find operation failed", error, {
        toolName: this.name,
        collection,
        filter,
      });

      return this.handleError(error);
    }
  }
}
