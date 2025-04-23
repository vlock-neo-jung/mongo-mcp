import { BaseTool, ToolParams, ToolResponse } from "../base/tool.js";
import { db } from "../../mongodb/client.js";
import { logger } from "../../utils/logger.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { validateSystemCollection } from "../../utils/mongodb-validators.js";

export interface InsertParams extends ToolParams {
  collection: string;
  document: Record<string, unknown> | Array<Record<string, unknown>> | string;
}

export class InsertDocumentTool extends BaseTool<InsertParams> {
  name = "insert";
  description = "Insert one or more documents into a MongoDB collection";

  inputSchema = {
    type: "object" as const,
    properties: {
      collection: {
        type: "string",
        description: "The name of the collection to insert documents into",
      },
      document: {
        type: ["object", "array", "string"],
        description:
          "Document or array of documents to insert. Can be a JSON string or object(s).",
      },
    },
    required: ["collection", "document"],
  };

  async execute(params: InsertParams): Promise<ToolResponse> {
    const { collection, document } = params;

    try {
      logger.debug("Executing insert operation", {
        toolName: this.name,
        collection,
        document,
      });

      // 시스템 컬렉션 접근 방지
      validateSystemCollection(collection, this.name);

      // 문서 파싱
      let documents: Array<Record<string, unknown>>;

      if (typeof document === "string") {
        try {
          const parsed = JSON.parse(document);
          if (Array.isArray(parsed)) {
            documents = parsed;
          } else if (typeof parsed === "object" && parsed !== null) {
            documents = [parsed];
          } else {
            const errorMessage = "Document must be an object or array of objects";
            logger.warn(errorMessage, { toolName: this.name, documentType: typeof parsed });
            throw new McpError(ErrorCode.InvalidRequest, errorMessage);
          }
        } catch (e) {
          const errorMessage = "Invalid document format: must be a valid JSON";
          logger.warn(errorMessage, { toolName: this.name, document });
          throw new McpError(ErrorCode.InvalidRequest, errorMessage);
        }
      } else if (Array.isArray(document)) {
        // 배열 요소가 모두 객체인지 검증
        if (document.some(item => typeof item !== "object" || item === null)) {
          const errorMessage = "All items in document array must be objects";
          logger.warn(errorMessage, { toolName: this.name });
          throw new McpError(ErrorCode.InvalidRequest, errorMessage);
        }
        documents = document;
      } else if (typeof document === "object" && document !== null) {
        documents = [document];
      } else {
        const errorMessage = "Document must be an object, array of objects, or JSON string";
        logger.warn(errorMessage, { toolName: this.name, documentType: typeof document });
        throw new McpError(ErrorCode.InvalidRequest, errorMessage);
      }

      // 삽입 작업 실행
      const coll = db.collection(collection);
      const result = documents.length === 1
        ? await coll.insertOne(documents[0])
        : await coll.insertMany(documents);

      // 응답 구성
      const insertCount = 'insertedCount' in result 
        ? result.insertedCount 
        : documents.length;
      
      const insertedIds = 'insertedId' in result
        ? { [0]: result.insertedId }
        : ('insertedIds' in result ? result.insertedIds : {});

      logger.debug("Insert operation completed successfully", {
        toolName: this.name,
        collection,
        documentCount: documents.length,
        insertCount,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              acknowledged: true,
              insertedCount: insertCount,
              insertedIds: insertedIds,
            }, null, 2),
          },
        ],
        isError: false,
      };
    } catch (error) {
      logger.error("Insert operation failed", error, {
        toolName: this.name,
        collection,
      });

      return this.handleError(error);
    }
  }
} 