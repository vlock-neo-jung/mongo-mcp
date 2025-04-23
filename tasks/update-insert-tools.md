# UpdateTool 및 InsertTool 개선 가이드

이 문서는 MongoDB MCP 서버의 UpdateTool과 InsertTool을 @sample 코드 수준으로 개선하기 위한 가이드를 제공합니다.

## 1. UpdateTool 개선

현재 프로젝트의 `UpdateOneTool`은 단일 문서만 업데이트하는 제한적인 기능을 제공합니다. @sample 코드의 update 도구는 더 다양한 기능과 강력한 검증을 제공합니다.

### 1.1. 주요 개선 사항

#### 업데이트 연산자 지원 강화
현재 `UpdateOneTool`은 제한된 업데이트 연산자만 지원합니다. @sample 코드 수준으로 다양한 MongoDB 업데이트 연산자를 지원해야 합니다.

```typescript
// src/mongodb/schema.ts에 업데이트 연산자 스키마 추가
export const MongoUpdateOperatorSchema = z.object({
  $set: z.record(z.unknown()).optional(),
  $unset: z.record(z.unknown()).optional(),
  $inc: z.record(z.number()).optional(),
  $mul: z.record(z.number()).optional(),
  $rename: z.record(z.string()).optional(),
  $min: z.record(z.unknown()).optional(),
  $max: z.record(z.unknown()).optional(),
  $currentDate: z.record(z.union([z.boolean(), z.object({ $type: z.literal("timestamp") })])).optional(),
  $addToSet: z.record(z.unknown()).optional(),
  $pop: z.record(z.union([z.literal(1), z.literal(-1)])).optional(),
  $pull: z.record(z.unknown()).optional(),
  $push: z.record(z.unknown()).optional(),
  $pullAll: z.record(z.array(z.unknown())).optional(),
});

export type MongoUpdateOperator = z.infer<typeof MongoUpdateOperatorSchema>;
```

#### 부분 필드 업데이트 강화
문서의 특정 필드만 업데이트할 수 있는 기능을 개선합니다.

```typescript
// UpdateOneTool의 inputSchema 개선
inputSchema = {
  type: "object" as const,
  properties: {
    collection: {
      type: "string",
      description: "Name of the collection to update",
    },
    filter: {
      type: "object",
      description: "MongoDB query filter to select the document",
      default: {},
    },
    update: {
      type: "object",
      description: "MongoDB update operators or replacement document",
    },
    upsert: {
      type: "boolean",
      description: "Create document if not found",
      default: false,
    },
    returnDocument: {
      type: "string",
      description: "Return the updated document",
      enum: ["before", "after"],
      default: "after",
    },
  },
  required: ["collection", "update"],
};
```

#### 반환 결과 개선
업데이트 후 문서 상태를 더 자세히 제공합니다.

```typescript
// UpdateOneTool의 execute 메서드 개선
async execute(params: UpdateParams): Promise<ToolResponse> {
  try {
    const collection = this.validateCollection(params.collection);
    const filter = params.filter || {};
    const update = this.validateUpdateOperation(params.update);
    
    const options = {
      upsert: params.upsert || false,
      returnDocument: params.returnDocument === "before" ? "before" : "after",
    };
    
    const result = await db
      .collection(collection)
      .findOneAndUpdate(filter, update, options);
    
    return {
      content: [
        { 
          type: "text" as const, 
          text: JSON.stringify({
            acknowledged: true,
            matchedCount: result.value ? 1 : 0,
            modifiedCount: result.lastErrorObject?.n || 0,
            upsertedId: result.lastErrorObject?.upserted || null,
            upsertedCount: result.lastErrorObject?.upserted ? 1 : 0,
            document: result.value
          }, null, 2)
        },
      ],
      isError: false,
    };
  } catch (error) {
    return this.handleError(error);
  }
}

// 업데이트 연산 검증 메서드 추가
private validateUpdateOperation(update: unknown): Record<string, unknown> {
  if (!update || typeof update !== "object") {
    throw new Error("Update must be an object");
  }
  
  const updateObj = update as Record<string, unknown>;
  
  // update가 $로 시작하는 연산자가 없으면 $set으로 감싸기
  const hasOperator = Object.keys(updateObj).some(key => key.startsWith("$"));
  if (!hasOperator) {
    return { $set: updateObj };
  }
  
  return updateObj;
}
```

## 2. InsertTool 개선

현재 프로젝트의 `InsertOneTool`은 기본적인 삽입 기능만 제공하고 있습니다. @sample 코드 수준으로 더 강력한 검증과 결과 정보를 제공하도록 개선해야 합니다.

### 2.1. 주요 개선 사항

#### 문서 스키마 검증 추가
삽입 전 문서의 기본 형식 검증을 수행합니다.

```typescript
// InsertOneTool의 inputSchema 개선
inputSchema = {
  type: "object" as const,
  properties: {
    collection: {
      type: "string",
      description: "Name of the collection to insert into",
    },
    document: {
      type: "object",
      description: "Document to insert",
    },
    ordered: {
      type: "boolean",
      description: "If true, continue on error",
      default: true,
    }
  },
  required: ["collection", "document"],
};
```

#### 삽입 오류 처리 개선
중복 키 등의 삽입 오류를 더 명확하게 처리합니다.

```typescript
// InsertOneTool의 execute 메서드 개선
async execute(params: InsertParams): Promise<ToolResponse> {
  try {
    const collection = this.validateCollection(params.collection);
    const document = this.validateDocument(params.document);
    
    // _id가 이미 있는지 확인
    if (document._id) {
      // _id가 유효한 ObjectId 문자열인지 확인하고 변환
      if (typeof document._id === 'string' && ObjectId.isValid(document._id)) {
        document._id = new ObjectId(document._id);
      }
    }
    
    const result = await db
      .collection(collection)
      .insertOne(document, { ordered: params.ordered !== false });
    
    return {
      content: [
        { 
          type: "text" as const, 
          text: JSON.stringify({
            acknowledged: result.acknowledged,
            insertedId: result.insertedId,
            insertedCount: result.acknowledged ? 1 : 0,
            document: { ...document, _id: result.insertedId }
          }, null, 2)
        },
      ],
      isError: false,
    };
  } catch (error) {
    // 중복 키 오류 처리
    if (error.code === 11000) {
      return this.handleError(createMongoError(
        MongoErrorCode.DOCUMENT_VALIDATION_FAILED,
        `중복 키 오류: 이미 동일한 키를 가진 문서가 존재합니다.`,
        error
      ));
    }
    return this.handleError(error);
  }
}

// 문서 검증 메서드 추가
private validateDocument(document: unknown): Record<string, unknown> {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new Error("Document must be an object");
  }
  
  // 빈 문서 체크
  if (Object.keys(document as object).length === 0) {
    throw new Error("Document cannot be empty");
  }
  
  return document as Record<string, unknown>;
}
```

## 3. 공통 개선 사항

두 도구 모두 동일하게 적용되는 개선 사항입니다.

### 3.1. 타입 안전성 개선

Zod를 사용하여 입력값과 반환값의 타입 안전성을 강화합니다.

```typescript
// 공통 반환 타입 정의
export const MongoUpdateResultSchema = z.object({
  acknowledged: z.boolean(),
  matchedCount: z.number(),
  modifiedCount: z.number(),
  upsertedId: z.unknown().nullable(),
  upsertedCount: z.number(),
  document: z.record(z.unknown()).optional(),
});

export const MongoInsertResultSchema = z.object({
  acknowledged: z.boolean(),
  insertedId: z.unknown(),
  insertedCount: z.number(),
  document: z.record(z.unknown()),
});
```

### 3.2. 오류 메시지 개선

더 명확하고 사용자 친화적인 오류 메시지를 제공합니다.

```typescript
// 삽입 관련 오류 메시지
export const insertErrorMessages: Record<string, string> = {
  duplicateKey: "동일한 키를 가진 문서가 이미 존재합니다. 고유한 키를 사용하세요.",
  invalidDocument: "문서 형식이 올바르지 않습니다. 유효한 JSON 객체를 제공하세요.",
  schemaViolation: "문서가 컬렉션 스키마와 일치하지 않습니다. 필수 필드가 누락되었거나 타입이 일치하지 않습니다.",
};

// 업데이트 관련 오류 메시지
export const updateErrorMessages: Record<string, string> = {
  documentNotFound: "업데이트할 문서를 찾을 수 없습니다. 필터 조건을 확인하세요.",
  invalidOperator: "지원되지 않는 업데이트 연산자입니다. 유효한 MongoDB 업데이트 연산자를 사용하세요.",
  immutableField: "변경할 수 없는 필드를 수정하려고 했습니다.",
  arrayModificationFailed: "배열 수정 작업이 실패했습니다. 배열 요소가 존재하는지 확인하세요.",
};
```

## 4. 테스트 방법

다음 테스트 시나리오를 통해 개선된 도구를 검증할 수 있습니다:

### 4.1. UpdateTool 테스트 시나리오

1. **기본 업데이트**: 특정 필드 값 변경
   ```
   "products 컬렉션에서 'product_id'가 'P12345'인 제품의 가격을 49.99로 업데이트해줘"
   ```

2. **$inc 연산자**: 특정 필드 값 증가
   ```
   "users 컬렉션에서 'username'이 'john'인 사용자의 포인트를 100만큼 증가시켜줘"
   ```

3. **복합 연산자**: 여러 업데이트 연산자 동시 사용
   ```
   "orders 컬렉션에서 'order_id'가 'ORD001'인 주문의 상태를 'shipped'로 변경하고, 처리 시간을 현재 시간으로 업데이트해줘"
   ```

### 4.2. InsertTool 테스트 시나리오

1. **기본 삽입**: 단일 문서 삽입
   ```
   "products 컬렉션에 새 제품 추가해줘: 이름은 '스마트 시계', 가격은 299.99, 카테고리는 '웨어러블'"
   ```

2. **중복 키 처리**: 기존 ID 재사용 시도
   ```
   "products 컬렉션에 ID가 'P12345'인 새 제품을 추가해줘" (ID가 이미 존재하는 경우)
   ```

3. **복잡한 문서 삽입**: 중첩 필드가 있는 문서
   ```
   "users 컬렉션에 새 사용자 추가해줘: 이름은 '김철수', 나이는 28, 주소는 '서울시 강남구', 연락처에는 이메일 'kim@example.com'과 전화번호 '010-1234-5678'"
   ```

각 테스트 시나리오는 개선된 도구가 @sample 코드의 기능 수준을 충족하는지 검증하는 데 도움이 됩니다. 