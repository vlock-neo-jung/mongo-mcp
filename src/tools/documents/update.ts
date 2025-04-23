import { BaseTool, ToolParams, ToolResponse } from "../base/tool.js";
import { db } from "../../mongodb/client.js";
import { logger } from "../../utils/logger.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { validateFilter, validateSystemCollection } from "../../utils/mongodb-validators.js";

export interface UpdateParams extends ToolParams {
  collection: string;
  filter: Record<string, unknown> | string;
  update: Record<string, unknown> | string;
  upsert?: boolean;
  many?: boolean;
}

export class UpdateTool extends BaseTool<UpdateParams> {
  name = "update";
  description = "Update documents in a MongoDB collection";

  inputSchema = {
    type: "object" as const,
    properties: {
      collection: {
        type: "string",
        description: "The name of the collection to update documents in",
      },
      filter: {
        type: ["object", "string"],
        description:
          "MongoDB query filter to select documents to update. Can be JSON string or filter object.",
      },
      update: {
        type: ["object", "string"],
        description:
          "MongoDB update operations. Can be JSON string or update object.",
      },
      upsert: {
        type: "boolean",
        description: "Create a new document if no documents match the filter",
      },
      many: {
        type: "boolean",
        description: "Update all documents that match the filter",
      },
    },
    required: ["collection", "filter", "update"],
  };

  async execute(params: UpdateParams): Promise<ToolResponse> {
    const { collection, filter, update, upsert = false, many = false } = params;

    try {
      logger.debug("Executing update operation", {
        toolName: this.name,
        collection,
        filter,
        update,
        upsert,
        many,
      });

      // 시스템 컬렉션 접근 방지
      validateSystemCollection(collection, this.name);

      // 필터 변환 및 검증
      const parsedFilter = validateFilter(filter, this.name);

      // 업데이트 변환 및 검증
      let parsedUpdate: Record<string, unknown>;
      if (typeof update === "string") {
        try {
          parsedUpdate = JSON.parse(update);
          if (!parsedUpdate || typeof parsedUpdate !== "object" || Array.isArray(parsedUpdate)) {
            const errorMessage = "Update must be a valid MongoDB update object";
            logger.warn(errorMessage, { toolName: this.name, update });
            throw new McpError(ErrorCode.InvalidRequest, errorMessage);
          }
        } catch (e) {
          const errorMessage = "Invalid update format: must be a valid JSON";
          logger.warn(errorMessage, { toolName: this.name, update });
          throw new McpError(ErrorCode.InvalidRequest, errorMessage);
        }
      } else if (typeof update === "object" && update !== null && !Array.isArray(update)) {
        parsedUpdate = update;
      } else {
        const errorMessage = "Update must be an object or JSON string";
        logger.warn(errorMessage, { toolName: this.name, updateType: typeof update });
        throw new McpError(ErrorCode.InvalidRequest, errorMessage);
      }

      // MongoDB 업데이트 연산자가 포함되어 있는지 확인
      const updateOperators = ["$set", "$unset", "$inc", "$push", "$pull", "$addToSet", "$rename"];
      const hasUpdateOperator = Object.keys(parsedUpdate).some(key => 
        updateOperators.includes(key)
      );

      // 업데이트 연산자가 없는 경우 $set으로 자동 래핑
      if (!hasUpdateOperator) {
        parsedUpdate = { $set: parsedUpdate };
      }

      // 업데이트 작업 실행
      const coll = db.collection(collection);
      let result;
      if (many) {
        result = await coll.updateMany(parsedFilter, parsedUpdate, { upsert });
      } else {
        result = await coll.updateOne(parsedFilter, parsedUpdate, { upsert });
      }

      // 응답 구성
      logger.debug("Update operation completed successfully", {
        toolName: this.name,
        collection,
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        upsertedId: result.upsertedId,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                acknowledged: true,
                matchedCount: result.matchedCount,
                modifiedCount: result.modifiedCount,
                upsertedId: result.upsertedId,
              },
              null,
              2
            ),
          },
        ],
        isError: false,
      };
    } catch (error) {
      logger.error("Update operation failed", error, {
        toolName: this.name,
        collection,
        filter,
        update,
      });

      return this.handleError(error);
    }
  }
} 