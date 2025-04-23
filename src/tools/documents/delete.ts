import { BaseTool, ToolParams, ToolResponse } from "../base/tool.js";
import { db } from "../../mongodb/client.js";
import { logger } from "../../utils/logger.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { validateFilter, validateSystemCollection } from "../../utils/mongodb-validators.js";

export interface DeleteParams extends ToolParams {
  collection: string;
  filter: Record<string, unknown> | string;
  many?: boolean;
}

export class DeleteTool extends BaseTool<DeleteParams> {
  name = "delete";
  description = "Delete documents from a MongoDB collection";

  inputSchema = {
    type: "object" as const,
    properties: {
      collection: {
        type: "string",
        description: "The name of the collection to delete documents from",
      },
      filter: {
        type: ["object", "string"],
        description:
          "MongoDB query filter to select documents to delete. Can be JSON string or filter object.",
      },
      many: {
        type: "boolean",
        description: "Delete all documents that match the filter",
      },
    },
    required: ["collection", "filter"],
  };

  async execute(params: DeleteParams): Promise<ToolResponse> {
    const { collection, filter, many = false } = params;

    try {
      logger.debug("Executing delete operation", {
        toolName: this.name,
        collection,
        filter,
        many,
      });

      // 시스템 컬렉션 접근 방지
      validateSystemCollection(collection, this.name);

      // 필터 변환 및 검증
      const parsedFilter = validateFilter(filter, this.name);

      // 삭제 작업 실행
      const coll = db.collection(collection);
      let result;
      if (many) {
        result = await coll.deleteMany(parsedFilter);
      } else {
        result = await coll.deleteOne(parsedFilter);
      }

      // 응답 구성
      logger.debug("Delete operation completed successfully", {
        toolName: this.name,
        collection,
        deletedCount: result.deletedCount,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                acknowledged: true,
                deletedCount: result.deletedCount,
              },
              null,
              2
            ),
          },
        ],
        isError: false,
      };
    } catch (error) {
      logger.error("Delete operation failed", error, {
        toolName: this.name,
        collection,
        filter,
      });

      return this.handleError(error);
    }
  }
} 