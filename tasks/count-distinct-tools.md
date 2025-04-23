# CountTool 및 DistinctTool 구현 가이드

이 문서는 MongoDB MCP 서버에 문서 카운트 및 고유값 조회 기능을 추가하기 위한 `CountTool`과 `DistinctTool` 구현 방법을 설명합니다.

## 1. CountTool 구현

### 개요

`CountTool`은 MongoDB 컬렉션에서 특정 조건에 맞는 문서의 수를 계산하는 도구입니다. 이 도구를 통해 사용자는 데이터 집합의 크기를 빠르게 파악할 수 있습니다.

### 구현 단계

#### 1.1. CountTool 클래스 구현

`src/tools/documents/count.ts` 파일을 생성하고 `CountTool` 클래스를 구현합니다:

```typescript
import { db } from "../../mongodb/client.js";
import { BaseTool, ToolParams, ToolResponse } from "../base/tool.js";
import { MongoQueryOperator } from "../../mongodb/schema.js";

export interface CountParams extends ToolParams {
  collection: string;
  filter?: Record<string, unknown | MongoQueryOperator>;
}

export class CountTool extends BaseTool<CountParams> {
  name = "count";
  description = "Count documents in a collection that match a query filter";
  
  inputSchema = {
    type: "object" as const,
    properties: {
      collection: {
        type: "string",
        description: "Name of the collection to count documents from",
      },
      filter: {
        type: "object",
        description: "MongoDB query filter with operators like $gt, $lt, $in, etc.",
        default: {},
      },
    },
    required: ["collection"],
  };

  async execute(params: CountParams): Promise<ToolResponse> {
    try {
      const collection = this.validateCollection(params.collection);
      const filter = params.filter || {};
      
      // 문서 수 계산
      const count = await db
        .collection(collection)
        .countDocuments(filter);
      
      // 결과 포맷팅
      const result = {
        collection,
        count,
        filter: Object.keys(filter).length > 0 ? filter : "all documents",
      };

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
        isError: false,
      };
    } catch (error) {
      return this.handleError(error);
    }
  }
}
```

#### 1.2. 도구 레지스트리에 등록

`src/tools/registry.ts` 파일을 수정하여 CountTool을 등록합니다:

```typescript
// 기존 imports에 추가
import { CountTool } from "./documents/count.js";

// ToolRegistry 클래스의 constructor 메서드 내부
constructor() {
  // 기존 도구 등록 코드...
  
  // CountTool 등록
  this.registerTool(new CountTool());
}
```

## 2. DistinctTool 구현

### 개요

`DistinctTool`은 MongoDB 컬렉션에서 특정 필드의 고유한 값을 조회하는 도구입니다. 이 도구를 통해 사용자는 데이터의 분포와 다양성을 파악할 수 있습니다.

### 구현 단계

#### 2.1. DistinctTool 클래스 구현

`src/tools/documents/distinct.ts` 파일을 생성하고 `DistinctTool` 클래스를 구현합니다:

```typescript
import { db } from "../../mongodb/client.js";
import { BaseTool, ToolParams, ToolResponse } from "../base/tool.js";
import { MongoQueryOperator } from "../../mongodb/schema.js";

export interface DistinctParams extends ToolParams {
  collection: string;
  field: string;
  filter?: Record<string, unknown | MongoQueryOperator>;
}

export class DistinctTool extends BaseTool<DistinctParams> {
  name = "distinct";
  description = "Find the distinct values for a specified field across a collection";
  
  inputSchema = {
    type: "object" as const,
    properties: {
      collection: {
        type: "string",
        description: "Name of the collection to query",
      },
      field: {
        type: "string",
        description: "Field for which to return distinct values",
      },
      filter: {
        type: "object",
        description: "MongoDB query filter to limit the distinct operation",
        default: {},
      },
    },
    required: ["collection", "field"],
  };

  async execute(params: DistinctParams): Promise<ToolResponse> {
    try {
      const collection = this.validateCollection(params.collection);
      const field = this.validateField(params.field);
      const filter = params.filter || {};
      
      // 고유값 조회
      const values = await db
        .collection(collection)
        .distinct(field, filter);
      
      // 결과 포맷팅
      const result = {
        collection,
        field,
        count: values.length,
        values,
        filter: Object.keys(filter).length > 0 ? filter : "no filter applied",
      };

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
        isError: false,
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // 필드 이름 검증
  private validateField(field: unknown): string {
    if (typeof field !== "string" || field.trim() === "") {
      throw new Error("Field name must be a non-empty string");
    }
    return field;
  }
}
```

#### 2.2. 도구 레지스트리에 등록

`src/tools/registry.ts` 파일을 수정하여 DistinctTool을 등록합니다:

```typescript
// 기존 imports에 추가
import { DistinctTool } from "./documents/distinct.js";

// ToolRegistry 클래스의 constructor 메서드 내부
constructor() {
  // 기존 도구 등록 코드...
  
  // DistinctTool 등록
  this.registerTool(new DistinctTool());
}
```

## 3. 테스트 시나리오

### 3.1. CountTool 테스트

다음 시나리오를 통해 `CountTool`의 기능을 테스트할 수 있습니다:

1. **전체 컬렉션 카운트**
   ```
   "users 컬렉션에 몇 명의 사용자가 있는지 알려줘"
   ```

   예상 결과:
   ```json
   {
     "collection": "users",
     "count": 150,
     "filter": "all documents"
   }
   ```

2. **필터를 적용한 카운트**
   ```
   "products 컬렉션에서 가격이 100달러 이상인 제품이 몇 개인지 알려줘"
   ```

   예상 결과:
   ```json
   {
     "collection": "products",
     "count": 37,
     "filter": { "price": { "$gte": 100 } }
   }
   ```

3. **복합 조건 카운트**
   ```
   "orders 컬렉션에서 상태가 'completed'이고 총액이 500달러 이상인 주문이 몇 개인지 알려줘"
   ```

   예상 결과:
   ```json
   {
     "collection": "orders",
     "count": 12,
     "filter": { "status": "completed", "total": { "$gte": 500 } }
   }
   ```

### 3.2. DistinctTool 테스트

다음 시나리오를 통해 `DistinctTool`의 기능을 테스트할 수 있습니다:

1. **기본 고유값 조회**
   ```
   "products 컬렉션에서 사용 가능한 모든 카테고리를 알려줘"
   ```

   예상 결과:
   ```json
   {
     "collection": "products",
     "field": "category",
     "count": 8,
     "values": ["전자제품", "가구", "의류", "도서", "식품", "화장품", "스포츠", "장난감"],
     "filter": "no filter applied"
   }
   ```

2. **필터를 적용한 고유값 조회**
   ```
   "products 컬렉션에서 가격이 50달러 미만인 제품들의 브랜드를 모두 알려줘"
   ```

   예상 결과:
   ```json
   {
     "collection": "products",
     "field": "brand",
     "count": 15,
     "values": ["브랜드A", "브랜드B", "브랜드C", ...],
     "filter": { "price": { "$lt": 50 } }
   }
   ```

3. **중첩 필드 고유값 조회**
   ```
   "users 컬렉션에서 모든 사용자가 거주하는 도시 목록을 보여줘"
   ```

   예상 결과:
   ```json
   {
     "collection": "users",
     "field": "address.city",
     "count": 25,
     "values": ["서울", "부산", "인천", "대구", ...],
     "filter": "no filter applied"
   }
   ```

## 4. 최적화 및 주의사항

### 4.1. CountTool 최적화

1. 대규모 컬렉션의 경우 `countDocuments()` 대신 `estimatedDocumentCount()`를 사용할 수 있습니다(필터 없을 때).
2. 복잡한 필터의 경우 인덱스를 활용하여 성능을 향상시킬 수 있습니다.
3. 초대형 컬렉션의 경우 정확한 카운트보다 추정치를 제공하는 것이 더 효율적일 수 있습니다.

### 4.2. DistinctTool 주의사항

1. 중복 제거는 메모리 사용량이 높을 수 있으므로, 매우 큰 컬렉션이나 카디널리티가 높은 필드에 주의해야 합니다.
2. 필터를 통해 결과 집합을 제한하면 성능을 향상시킬 수 있습니다.
3. 배열 필드에서의 고유값 조회는 배열 요소별로 별도의 값으로 처리됩니다.

## 5. 예상 사용 시나리오

### 5.1. CountTool 활용 사례

- 데이터베이스의 성장 추적(사용자 수, 제품 수 등)
- 필터링된 데이터 세트의 크기 확인
- 시간에 따른 데이터 변화 분석(특정 기간 동안의 주문 수 등)
- 조건부 로직 구현을 위한 결과 검증

### 5.2. DistinctTool 활용 사례

- 다양한 범주형 데이터 탐색(제품 카테고리, 사용자 역할 등)
- 데이터 품질 검사(유효한 상태값, 허용된 값 범위 확인 등)
- 필터링을 위한 옵션 목록 생성
- 데이터 분포 이해(사용자 위치, 제품 속성 등) 