import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import {
  MongoErrorCode,
  createMongoError,
  convertToMcpError,
  mapMongoDBErrorToMongoErrorCode
} from "../../mongodb/errors.js";
import { logger } from "../../utils/logger.js";

export interface ToolResponse {
  content: {
    type: "text";
    text: string;
  }[];
  isError: boolean;
  _meta?: Record<string, unknown>;
}

export type ToolParams = {
  [key: string]: unknown;
};

export abstract class BaseTool<T extends ToolParams = ToolParams> {
  abstract name: string;
  abstract description: string;
  abstract inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };

  abstract execute(params: T): Promise<ToolResponse>;

  protected validateCollection(collection: unknown): string {
    if (typeof collection !== "string") {
      const errorMessage = `Collection name must be a string, got ${typeof collection}`;
      logger.warn(errorMessage, { toolName: this.name });
      throw new McpError(
        ErrorCode.InvalidRequest,
        errorMessage
      );
    }
    return collection;
  }

  protected validateObject(
    value: unknown,
    name: string
  ): Record<string, unknown> {
    if (!value || typeof value !== "object") {
      const errorMessage = `${name} must be an object`;
      logger.warn(errorMessage, { toolName: this.name, value });
      throw new McpError(ErrorCode.InvalidRequest, errorMessage);
    }
    return value as Record<string, unknown>;
  }

  protected handleError(error: unknown): ToolResponse {
    let errorMessage: string;
    let mongoErrorCode: MongoErrorCode | undefined;

    if (error instanceof McpError) {
      errorMessage = error.message;
      logger.error(`MCP Error: ${errorMessage}`, error, { 
        toolName: this.name,
        errorCode: error.code 
      });
    } else {
      // MongoDB 네이티브 오류 처리
      mongoErrorCode = mapMongoDBErrorToMongoErrorCode(error);
      const mongoError = createMongoError(
        mongoErrorCode,
        error instanceof Error ? error.message : String(error),
        error
      );
      errorMessage = mongoError.message;

      // 구조화된 로깅
      logger.error(`MongoDB Error: ${errorMessage}`, error, {
        toolName: this.name,
        mongoErrorCode,
        details: mongoError.details
      });
    }

    return {
      content: [
        {
          type: "text",
          text: errorMessage,
        },
      ],
      isError: true,
      _meta: mongoErrorCode ? { code: mongoErrorCode } : undefined,
    };
  }
}
