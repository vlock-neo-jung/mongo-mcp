import { BaseTool, ToolParams, ToolResponse } from "../base/tool.js";
import { db } from "../../mongodb/client.js";
import { logger } from "../../utils/logger.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { validateSystemCollection } from "../../utils/mongodb-validators.js";

export interface InsertParams extends ToolParams {
  collection: string;
  documents: Record<string, unknown> | Array<Record<string, unknown>> | string;
  ordered?: boolean;
  writeConcern?: Record<string, unknown>;
  bypassDocumentValidation?: boolean;
}

export class InsertTool extends BaseTool<InsertParams> {
  name = "insert";
  description = "Insert one or more documents into a MongoDB collection";

  inputSchema = {
    type: "object" as const,
    properties: {
      collection: {
        type: "string",
        description: "The name of the collection to insert documents into",
      },
      documents: {
        type: ["object", "array", "string"],
        description:
          "Document(s) to insert. Can be a single document, array of documents, or JSON string.",
      },
      ordered: {
        type: "boolean",
        description: "Optional: If true, perform an ordered insert of the documents. If false, perform an unordered insert",
        default: true,
      },
      writeConcern: {
        type: "object",
        description: "Optional: Write concern for the insert operation",
      },
      bypassDocumentValidation: {
        type: "boolean",
        description: "Optional: Allow insert to bypass schema validation",
      },
    },
    required: ["collection", "documents"],
  };

  async execute(params: InsertParams): Promise<ToolResponse> {
    const { collection, documents, ordered = true, writeConcern, bypassDocumentValidation } = params;

    try {
      logger.debug("Executing insert operation", {
        toolName: this.name,
        collection,
        documents,
        ordered,
        writeConcern,
        bypassDocumentValidation
      });

      // 시스템 컬렉션 접근 방지
      validateSystemCollection(collection, this.name);

      // 문서 파싱
      let parsedDocuments: Array<Record<string, unknown>>;

      if (typeof documents === "string") {
        try {
          const parsed = JSON.parse(documents);
          if (Array.isArray(parsed)) {
            parsedDocuments = parsed;
          } else if (typeof parsed === "object" && parsed !== null) {
            parsedDocuments = [parsed];
          } else {
            const errorMessage = "Documents must be an object or array of objects";
            logger.warn(errorMessage, { toolName: this.name, documentType: typeof parsed });
            throw new McpError(ErrorCode.InvalidRequest, errorMessage);
          }
        } catch (e) {
          const errorMessage = "Invalid document format: must be a valid JSON";
          logger.warn(errorMessage, { toolName: this.name, documents });
          throw new McpError(ErrorCode.InvalidRequest, errorMessage);
        }
      } else if (Array.isArray(documents)) {
        // 배열 요소가 모두 객체인지 검증
        if (documents.length === 0) {
          const errorMessage = "Documents array cannot be empty";
          logger.warn(errorMessage, { toolName: this.name });
          throw new McpError(ErrorCode.InvalidRequest, errorMessage);
        }
        
        if (documents.some(item => typeof item !== "object" || item === null)) {
          const errorMessage = "All items in document array must be objects";
          logger.warn(errorMessage, { toolName: this.name });
          throw new McpError(ErrorCode.InvalidRequest, errorMessage);
        }
        parsedDocuments = documents;
      } else if (typeof documents === "object" && documents !== null) {
        parsedDocuments = [documents];
      } else {
        const errorMessage = "Documents must be an object, array of objects, or JSON string";
        logger.warn(errorMessage, { toolName: this.name, documentType: typeof documents });
        throw new McpError(ErrorCode.InvalidRequest, errorMessage);
      }

      // 삽입 옵션 설정
      const options = {
        ordered,
        writeConcern,
        bypassDocumentValidation,
      };

      // 삽입 작업 실행
      const coll = db.collection(collection);
      // insertMany 사용 (단일 문서에도 동작)
      const result = await coll.insertMany(parsedDocuments, options);

      // 응답 구성
      logger.debug("Insert operation completed successfully", {
        toolName: this.name,
        collection,
        documentCount: parsedDocuments.length,
        insertedCount: result.insertedCount,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              acknowledged: result.acknowledged,
              insertedCount: result.insertedCount,
              insertedIds: result.insertedIds,
            }, null, 2),
          },
        ],
        isError: false,
      };
    } catch (error) {
      // 중복 키 오류 특별 처리 (MongoDB 오류 코드 11000)
      if (error.code === 11000 || (error.name === "BulkWriteError" && error.code === 11000)) {
        const bulkError = error.name === "BulkWriteError" ? error : null;
        
        // BulkWriteError 특수 처리
        if (bulkError) {
          logger.warn("Bulk write error occurred during insert", {
            toolName: this.name,
            writeErrors: bulkError.writeErrors,
            insertedCount: bulkError.result?.nInserted || 0,
            failedCount: bulkError.result?.nFailedInserts || 0
          });
          
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    error: "Bulk write error occurred",
                    writeErrors: bulkError.writeErrors,
                    insertedCount: bulkError.result?.nInserted || 0,
                    failedCount: bulkError.result?.nFailedInserts || 0,
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }
      }

      logger.error("Insert operation failed", error, {
        toolName: this.name,
        collection,
      });

      return this.handleError(error);
    }
  }
} 