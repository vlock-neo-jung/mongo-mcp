import { db } from "../../mongodb/client.js";
import { BaseTool, ToolParams, ToolResponse } from "../base/tool.js";
import { MongoUpdateOperator } from "../../mongodb/schema.js";
import { logger } from "../../utils/logger.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

interface UpdateParams extends ToolParams {
  collection: string;
  filter: Record<string, unknown> | string;
  update: Record<string, unknown>;
  upsert?: boolean;
  multi?: boolean;
  [key: string]: unknown;
}

export class UpdateOneTool extends BaseTool<UpdateParams> {
  name = "update";
  description = "Update documents in a MongoDB collection";
  inputSchema = {
    type: "object" as const,
    properties: {
      collection: {
        type: "string",
        description: "Name of the collection to update",
      },
      filter: {
        type: ["object", "string"],
        description: "Filter to select documents to update",
      },
      update: {
        type: "object",
        description: "Update operations to apply ($set, $unset, $inc, etc.)",
      },
      upsert: {
        type: "boolean",
        description: "Create a new document if no documents match the filter",
        default: false,
      },
      multi: {
        type: "boolean",
        description: "Update multiple documents that match the filter",
        default: false,
      },
    },
    required: ["collection", "filter", "update"],
  };

  async execute(params: UpdateParams): Promise<ToolResponse> {
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
          queryFilter = params.filter;
        } else {
          const errorMessage = "Query filter must be a plain object or JSON string";
          logger.warn(errorMessage, { toolName: this.name, filterType: typeof params.filter });
          throw new McpError(ErrorCode.InvalidRequest, errorMessage);
        }
      }
      
      // 업데이트 연산자 검증
      const update = this.validateUpdateOperation(params.update);
      
      // 옵션 설정
      const options = {
        upsert: !!params.upsert,
      };
      
      // updateOne 또는 updateMany 메서드 선택
      const updateMethod = params.multi ? "updateMany" : "updateOne";
      const result = await db.collection(collection)[updateMethod](queryFilter, update, options);
      
      logger.debug(`Updated documents in ${collection}`, { 
        toolName: this.name, 
        collection,
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                matchedCount: result.matchedCount,
                modifiedCount: result.modifiedCount,
                upsertedCount: result.upsertedCount || 0,
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
      return this.handleError(error);
    }
  }
  
  // 업데이트 연산 검증 메서드
  private validateUpdateOperation(update: unknown): Record<string, unknown> {
    if (!update || typeof update !== "object" || Array.isArray(update)) {
      const errorMessage = "Update must be a valid MongoDB update document";
      logger.warn(errorMessage, { toolName: this.name, updateType: typeof update });
      throw new McpError(ErrorCode.InvalidRequest, errorMessage);
    }
    
    const updateObj = update as Record<string, unknown>;
    
    // 업데이트 연산자 확인
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
        toolName: this.name, 
        providedKeys: Object.keys(updateObj)
      });
      return { $set: updateObj };
    }
    
    return updateObj;
  }
}
