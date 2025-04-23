# 첫 번째 업그레이드 단계 상세 내용

## Zod 라이브러리 통합 및 첫 번째 도구 개선

이 문서는 MongoDB MCP 서버 업그레이드의 첫 번째 단계에 대한 상세 정보를 제공합니다.

### Zod 라이브러리 설치

```bash
npm install zod
```

### Zod 스키마 예제

`src/mongodb/schema.ts` 파일에 다음과 같은 Zod 스키마를 추가할 수 있습니다:

```typescript
import { z } from "zod";

// MongoDB 쿼리 연산자 스키마
export const MongoQueryOperatorSchema = z.object({
  $eq: z.unknown().optional(),
  $gt: z.unknown().optional(),
  $gte: z.unknown().optional(),
  $in: z.array(z.unknown()).optional(),
  $lt: z.unknown().optional(),
  $lte: z.unknown().optional(),
  $ne: z.unknown().optional(),
  $nin: z.array(z.unknown()).optional(),
  $and: z.array(z.unknown()).optional(),
  $not: z.unknown().optional(),
  $nor: z.array(z.unknown()).optional(),
  $or: z.array(z.unknown()).optional(),
  $exists: z.boolean().optional(),
  $type: z.union([z.string(), z.number()]).optional(),
  $regex: z.string().optional(),
  $options: z.string().optional(),
});

export type MongoQueryOperator = z.infer<typeof MongoQueryOperatorSchema>;

// MongoDB 정렬 옵션 스키마
export const MongoSortSchema = z.record(z.union([z.literal(1), z.literal(-1)]));

export type MongoSort = z.infer<typeof MongoSortSchema>;
```

### FindTool 개선 예제

`src/tools/documents/find.ts` 파일을 다음과 같이 수정하여 개선된 쿼리 기능을 구현할 수 있습니다:

```typescript
import { db } from "../../mongodb/client.js";
import { BaseTool, ToolParams, ToolResponse } from "../base/tool.js";
import { MongoQueryOperator, MongoSort } from "../../mongodb/schema.js";
import { z } from "zod";

export interface FindParams extends ToolParams {
  collection: string;
  filter?: Record<string, unknown | MongoQueryOperator>;
  limit?: number;
  skip?: number;
  projection?: Record<string, 0 | 1>;
  sort?: MongoSort;
}

export class FindTool extends BaseTool<FindParams> {
  name = "find";
  description = "Query documents in a collection using MongoDB query syntax";
  
  // Zod를 사용하여 입력 스키마 정의
  inputSchema = {
    type: "object" as const,
    properties: {
      collection: {
        type: "string",
        description: "Name of the collection to query",
      },
      filter: {
        type: "object",
        description: "MongoDB query filter with operators like $gt, $lt, $in, etc.",
        default: {},
      },
      limit: {
        type: "number",
        description: "Maximum documents to return",
        default: 10,
        minimum: 1,
        maximum: 1000,
      },
      skip: {
        type: "number",
        description: "Number of documents to skip",
        default: 0,
        minimum: 0,
      },
      projection: {
        type: "object",
        description: "Fields to include (1) or exclude (0)",
        default: {},
      },
      sort: {
        type: "object",
        description: "Sort order: 1 for ascending, -1 for descending",
        default: {},
      },
    },
    required: ["collection"],
  };

  async execute(params: FindParams): Promise<ToolResponse> {
    try {
      const collection = this.validateCollection(params.collection);
      
      // 기본 쿼리 생성
      let query = db
        .collection(collection)
        .find(params.filter || {});
      
      // 프로젝션 적용
      if (params.projection && Object.keys(params.projection).length > 0) {
        query = query.project(params.projection);
      }
      
      // 정렬 적용
      if (params.sort && Object.keys(params.sort).length > 0) {
        query = query.sort(params.sort);
      }
      
      // 페이징 적용
      if (typeof params.skip === 'number' && params.skip > 0) {
        query = query.skip(params.skip);
      }
      
      // 결과 제한
      const limit = Math.min(params.limit || 10, 1000);
      query = query.limit(limit);
      
      // 쿼리 실행
      const results = await query.toArray();

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(results, null, 2) },
        ],
        isError: false,
      };
    } catch (error) {
      return this.handleError(error);
    }
  }
}
```

### 테스트 방법

1. Zod 라이브러리 설치 후, 위 코드를 적용합니다.
2. 테스트 데이터베이스에 다음과 같은 복잡한 쿼리를 실행해 봅니다:

```
"users 컬렉션에서 나이가 30 이상이고 'hiking'에 관심이 있는 사용자를 찾아줘"
```

이 쿼리는 다음과 같은 필터로 변환됩니다:

```json
{
  "age": { "$gte": 30 },
  "interests": "hiking"
}
```

3. 정렬 기능도 테스트합니다:

```
"products 컬렉션에서 가격이 높은 순으로 상위 5개 제품을 보여줘"
```

이 쿼리는 다음과 같은 매개변수로 변환됩니다:

```json
{
  "collection": "products",
  "sort": { "price": -1 },
  "limit": 5
}
``` 