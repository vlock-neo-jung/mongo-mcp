import { db } from "../../mongodb/client.js";
import { BaseTool, ToolParams, ToolResponse } from "../base/tool.js";
import { logger } from "../../utils/logger.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { MongoErrorCode, createMongoError } from "../../mongodb/errors.js";

interface InsertParams extends ToolParams {
  collection: string;
  documents: Record<string, unknown>[] | Record<string, unknown>;
  ordered?: boolean;
  writeConcern?: Record<string, unknown>;
  bypassDocumentValidation?: boolean;
  [key: string]: unknown;
}

export class InsertOneTool extends BaseTool<InsertParams> {
  name = "insert";
  description = "Insert one or more documents into a MongoDB collection";
  inputSchema = {
    type: "object" as const,
    properties: {
      collection: {
        type: "string",
        description: "Name of the collection to insert into",
      },
      documents: {
        type: ["array", "object"],
        description: "Array of documents to insert, or a single document",
        items: {
          type: "object",
        }
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
    try {
      const collection = this.validateCollection(params.collection);
      
      // 시스템 컬렉션 접근 방지
      if (collection.startsWith("system.")) {
        const errorMessage = "Access to system collections is not allowed";
        logger.warn(errorMessage, { toolName: this.name, collection });
        throw new McpError(ErrorCode.InvalidRequest, errorMessage);
      }
      
      // 문서 배열 검증
      let documents: Record<string, unknown>[] = [];
      
      if (Array.isArray(params.documents)) {
        // 배열로 제공된 경우
        documents = params.documents;
        
        // 빈 배열 체크
        if (documents.length === 0) {
          const errorMessage = "Documents array cannot be empty";
          logger.warn(errorMessage, { toolName: this.name });
          throw new McpError(ErrorCode.InvalidRequest, errorMessage);
        }
        
        // 모든 항목이 객체인지 확인
        if (!documents.every(doc => doc && typeof doc === "object" && !Array.isArray(doc))) {
          const errorMessage = "Each document must be a valid MongoDB document object";
          logger.warn(errorMessage, { toolName: this.name });
          throw new McpError(ErrorCode.InvalidRequest, errorMessage);
        }
      } else if (params.documents && typeof params.documents === "object" && !Array.isArray(params.documents)) {
        // 단일 문서로 제공된 경우
        documents = [params.documents];
      } else {
        const errorMessage = "Documents must be an array of objects or a single object";
        logger.warn(errorMessage, { 
          toolName: this.name,
          documentsType: typeof params.documents,
          isArray: Array.isArray(params.documents)
        });
        throw new McpError(ErrorCode.InvalidRequest, errorMessage);
      }
      
      // 삽입 옵션 설정
      const options = {
        ordered: params.ordered !== false, // 기본값: true
        writeConcern: params.writeConcern,
        bypassDocumentValidation: params.bypassDocumentValidation,
      };
      
      // insertMany 사용 (단일 문서에도 동작)
      const result = await db.collection(collection).insertMany(documents, options);
      
      logger.debug(`Inserted ${result.insertedCount} documents into ${collection}`, { 
        toolName: this.name, 
        collection,
        insertedCount: result.insertedCount
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                acknowledged: result.acknowledged,
                insertedCount: result.insertedCount,
                insertedIds: result.insertedIds,
              },
              null,
              2
            ),
          },
        ],
        isError: false,
      };
    } catch (error) {
      // 중복 키 오류 특별 처리
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
            _meta: { code: MongoErrorCode.DOCUMENT_VALIDATION_FAILED },
          };
        }
        
        // 일반 중복 키 오류
        return this.handleError(createMongoError(
          MongoErrorCode.DOCUMENT_VALIDATION_FAILED,
          "중복 키 오류: 이미 동일한 키를 가진 문서가 존재합니다.",
          error
        ));
      }
      
      return this.handleError(error);
    }
  }
}
