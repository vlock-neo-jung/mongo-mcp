import { z } from "zod";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

// MongoDB 특화 오류 코드
export enum MongoErrorCode {
  INVALID_QUERY = "INVALID_QUERY",
  COLLECTION_NOT_FOUND = "COLLECTION_NOT_FOUND",
  DATABASE_NOT_FOUND = "DATABASE_NOT_FOUND",
  INVALID_PIPELINE = "INVALID_PIPELINE",
  INVALID_PROJECTION = "INVALID_PROJECTION",
  INVALID_SORT = "INVALID_SORT",
  CONNECTION_ERROR = "CONNECTION_ERROR",
  TIMEOUT = "TIMEOUT",
  UNAUTHORIZED = "UNAUTHORIZED",
  OPERATION_FAILED = "OPERATION_FAILED",
  INDEX_CREATION_FAILED = "INDEX_CREATION_FAILED",
  INDEX_DELETION_FAILED = "INDEX_DELETION_FAILED",
  DOCUMENT_VALIDATION_FAILED = "DOCUMENT_VALIDATION_FAILED"
}

// MCP 오류 코드와 MongoDB 오류 코드 매핑
export const errorCodeMapping: Record<MongoErrorCode, ErrorCode> = {
  [MongoErrorCode.INVALID_QUERY]: ErrorCode.InvalidRequest,
  [MongoErrorCode.COLLECTION_NOT_FOUND]: ErrorCode.InvalidRequest,
  [MongoErrorCode.DATABASE_NOT_FOUND]: ErrorCode.InvalidRequest,
  [MongoErrorCode.INVALID_PIPELINE]: ErrorCode.InvalidRequest,
  [MongoErrorCode.INVALID_PROJECTION]: ErrorCode.InvalidRequest,
  [MongoErrorCode.INVALID_SORT]: ErrorCode.InvalidRequest,
  [MongoErrorCode.CONNECTION_ERROR]: ErrorCode.InvalidRequest,
  [MongoErrorCode.TIMEOUT]: ErrorCode.InvalidRequest,
  [MongoErrorCode.UNAUTHORIZED]: ErrorCode.InvalidRequest,
  [MongoErrorCode.OPERATION_FAILED]: ErrorCode.InvalidRequest,
  [MongoErrorCode.INDEX_CREATION_FAILED]: ErrorCode.InvalidRequest,
  [MongoErrorCode.INDEX_DELETION_FAILED]: ErrorCode.InvalidRequest,
  [MongoErrorCode.DOCUMENT_VALIDATION_FAILED]: ErrorCode.InvalidRequest
};

// 오류 상세 정보 스키마
export const MongoErrorSchema = z.object({
  code: z.nativeEnum(MongoErrorCode),
  message: z.string(),
  details: z.unknown().optional(),
});

export type MongoError = z.infer<typeof MongoErrorSchema>;

// MongoDB 네이티브 오류 코드를 내부 오류 코드로 변환하는 함수
export function mapMongoDBErrorToMongoErrorCode(error: any): MongoErrorCode {
  if (!error || !error.code) {
    return MongoErrorCode.OPERATION_FAILED;
  }

  // MongoDB 네이티브 오류 코드 매핑
  // https://github.com/mongodb/mongo/blob/master/src/mongo/base/error_codes.yml
  switch (error.code) {
    case 11000: // 중복 키 오류
      return MongoErrorCode.DOCUMENT_VALIDATION_FAILED;
    case 20: // 인증 실패
      return MongoErrorCode.UNAUTHORIZED;
    case 13: // 권한 없음
      return MongoErrorCode.UNAUTHORIZED;
    case 26: // 네임스페이스(컬렉션) 찾을 수 없음
      return MongoErrorCode.COLLECTION_NOT_FOUND;
    case 50: // 검색 실행 오류
      return MongoErrorCode.INVALID_QUERY;
    case 14: // 커맨드 찾을 수 없음
      return MongoErrorCode.INVALID_QUERY;
    case 50: // 쿼리 실행 시간 초과
      return MongoErrorCode.TIMEOUT;
    default:
      return MongoErrorCode.OPERATION_FAILED;
  }
}

// 사용자 친화적 오류 메시지
export const friendlyErrorMessages: Record<MongoErrorCode, string> = {
  [MongoErrorCode.INVALID_QUERY]: "쿼리 형식이 올바르지 않습니다. 쿼리 구문을 확인해주세요.",
  [MongoErrorCode.COLLECTION_NOT_FOUND]: "요청한 컬렉션을 찾을 수 없습니다. 컬렉션 이름을 확인해주세요.",
  [MongoErrorCode.DATABASE_NOT_FOUND]: "요청한 데이터베이스를 찾을 수 없습니다. 연결 문자열을 확인해주세요.",
  [MongoErrorCode.INVALID_PIPELINE]: "집계 파이프라인 형식이 올바르지 않습니다. 단계를 확인해주세요.",
  [MongoErrorCode.INVALID_PROJECTION]: "프로젝션 형식이 올바르지 않습니다. 필드 지정 방식을 확인해주세요.",
  [MongoErrorCode.INVALID_SORT]: "정렬 형식이 올바르지 않습니다. 정렬 방향을 1(오름차순) 또는 -1(내림차순)으로 지정해주세요.",
  [MongoErrorCode.CONNECTION_ERROR]: "데이터베이스 연결 오류가 발생했습니다. 연결 설정을 확인해주세요.",
  [MongoErrorCode.TIMEOUT]: "쿼리 실행 시간이 초과되었습니다. 쿼리를 단순화하거나 인덱스를 확인해주세요.",
  [MongoErrorCode.UNAUTHORIZED]: "데이터베이스 접근 권한이 없습니다. 인증 정보를 확인해주세요.",
  [MongoErrorCode.OPERATION_FAILED]: "데이터베이스 작업이 실패했습니다. 자세한 오류 내용을 확인해주세요.",
  [MongoErrorCode.INDEX_CREATION_FAILED]: "인덱스 생성에 실패했습니다. 필드 타입과 옵션을 확인해주세요.",
  [MongoErrorCode.INDEX_DELETION_FAILED]: "인덱스 삭제에 실패했습니다. 인덱스 이름을 확인해주세요.",
  [MongoErrorCode.DOCUMENT_VALIDATION_FAILED]: "문서 유효성 검사에 실패했습니다. 중복 키 또는 필수 필드를 확인해주세요."
};

// 오류 생성 유틸리티 함수
export function createMongoError(
  code: MongoErrorCode,
  message?: string,
  details?: unknown
): MongoError {
  return {
    code,
    message: message || friendlyErrorMessages[code],
    details,
  };
}

// MCP 오류로 변환하는 함수
export function convertToMcpError(mongoError: MongoError): McpError {
  const mcpErrorCode = errorCodeMapping[mongoError.code];
  return new McpError(
    mcpErrorCode,
    mongoError.message,
    mongoError.details
  );
} 