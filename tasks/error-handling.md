# MongoDB MCP 서버 오류 처리 시스템 개선

이 문서는 MongoDB MCP 서버의 오류 처리 시스템을 개선하기 위한 가이드를 제공합니다.

## 개요

현재 프로젝트의 오류 처리 시스템은 기본적인 기능을 제공하지만, 더 세분화된 오류 코드와 사용자 친화적인 메시지를 추가함으로써 디버깅과 사용자 경험을 향상시킬 수 있습니다.

## 구현 단계

### 1. 오류 코드 스키마 정의

`src/mongodb/errors.ts` 파일을 생성하고 오류 코드 스키마를 정의합니다:

```typescript
import { z } from "zod";
import { McpError, ErrorCode as McpErrorCode } from "@modelcontextprotocol/sdk/types.js";

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
export const errorCodeMapping: Record<MongoErrorCode, McpErrorCode> = {
  [MongoErrorCode.INVALID_QUERY]: McpErrorCode.InvalidRequest,
  [MongoErrorCode.COLLECTION_NOT_FOUND]: McpErrorCode.NotFound,
  [MongoErrorCode.DATABASE_NOT_FOUND]: McpErrorCode.NotFound,
  [MongoErrorCode.INVALID_PIPELINE]: McpErrorCode.InvalidRequest,
  [MongoErrorCode.INVALID_PROJECTION]: McpErrorCode.InvalidRequest,
  [MongoErrorCode.INVALID_SORT]: McpErrorCode.InvalidRequest,
  [MongoErrorCode.CONNECTION_ERROR]: McpErrorCode.ServerError,
  [MongoErrorCode.TIMEOUT]: McpErrorCode.Timeout,
  [MongoErrorCode.UNAUTHORIZED]: McpErrorCode.Unauthorized,
  [MongoErrorCode.OPERATION_FAILED]: McpErrorCode.ServerError,
  [MongoErrorCode.INDEX_CREATION_FAILED]: McpErrorCode.ServerError,
  [MongoErrorCode.INDEX_DELETION_FAILED]: McpErrorCode.ServerError,
  [MongoErrorCode.DOCUMENT_VALIDATION_FAILED]: McpErrorCode.InvalidRequest
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
```

### 2. BaseTool 클래스 수정

`src/tools/base/tool.ts` 파일을 수정하여 새로운 오류 처리 시스템을 통합합니다:

```typescript
// 기존 import 수정
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import {
  MongoErrorCode,
  createMongoError,
  convertToMcpError,
  mapMongoDBErrorToMongoErrorCode
} from "../../mongodb/errors.js";

// 나머지 코드는 그대로 유지...

// handleError 메서드 업데이트
protected handleError(error: unknown): ToolResponse {
  let errorMessage: string;
  let isMongoDBError = false;

  if (error instanceof McpError) {
    errorMessage = error.message;
  } else {
    // MongoDB 네이티브 오류 처리
    const mongoErrorCode = mapMongoDBErrorToMongoErrorCode(error);
    const mongoError = createMongoError(
      mongoErrorCode,
      error instanceof Error ? error.message : String(error),
      error
    );
    isMongoDBError = true;
    errorMessage = mongoError.message;

    // 디버깅을 위한 로깅
    console.error("MongoDB error:", JSON.stringify(mongoError, null, 2));
  }

  return {
    content: [
      {
        type: "text",
        text: errorMessage,
      },
    ],
    isError: true,
    _meta: isMongoDBError ? { code: mongoErrorCode } : undefined,
  };
}
```

### 3. 도구별 오류 처리 개선

각 도구 클래스(예: `FindTool`, `AggregateTool` 등)의 `execute` 메서드에서 특정 오류 상황에 대한 처리를 추가합니다. 예를 들어 `FindTool`의 경우:

```typescript
// FindTool의 execute 메서드 내에서
try {
  // 기존 코드...
} catch (error) {
  // 특정 오류 상황 감지
  if (error.name === 'MongoParseError') {
    return this.handleError(createMongoError(
      MongoErrorCode.INVALID_QUERY,
      `쿼리 구문 오류: ${error.message}`
    ));
  }
  
  if (error.message && error.message.includes('cannot sort')) {
    return this.handleError(createMongoError(
      MongoErrorCode.INVALID_SORT,
      `정렬 오류: ${error.message}`
    ));
  }
  
  // 기본 오류 처리로 전달
  return this.handleError(error);
}
```

## 테스트 방법

다음과 같은 시나리오를 테스트하여 오류 처리 시스템이 제대로 작동하는지 확인할 수 있습니다:

1. 존재하지 않는 컬렉션에 쿼리 실행
2. 잘못된 형식의 쿼리 실행
3. 잘못된 형식의 집계 파이프라인 실행
4. 유효하지 않은 인덱스 생성 시도
5. 중복 키 오류가 발생하는 문서 삽입

각 시나리오에서 사용자 친화적인 오류 메시지가 반환되고, 적절한 오류 코드가 설정되는지 확인하세요.

## 로깅 개선 방법

오류 로깅을 개선하려면 다음 단계를 고려하세요:

1. 로깅 수준 구성 추가 (DEBUG, INFO, WARN, ERROR)
2. 구조화된 로그 형식 사용 (JSON 형식 권장)
3. 오류 컨텍스트 추가 (요청 ID, 타임스탬프, 사용자 정보 등)
4. 개발 모드와 프로덕션 모드에서 다른 로그 형식 제공

## 주의사항

1. 보안 민감 정보(비밀번호, 연결 문자열 등)가 오류 메시지나 로그에 노출되지 않도록 주의하세요.
2. 오류 메시지는 사용자 친화적이면서도 문제 해결에 도움이 되어야 합니다.
3. 지나치게 상세한 내부 오류 정보가 사용자에게 노출되지 않도록 합니다.
4. 오류 코드는 일관성 있게 유지하고, 필요한 경우 확장 가능하도록 설계하세요. 