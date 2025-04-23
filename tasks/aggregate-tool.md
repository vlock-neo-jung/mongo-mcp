# 집계 도구(AggregateTool) 구현 가이드

이 문서는 MongoDB MCP 서버에 집계 파이프라인 기능을 추가하기 위한 `AggregateTool` 구현 방법을 설명합니다.

## 개요

MongoDB의 집계 파이프라인은 데이터 처리 및 분석을 위한 강력한 기능입니다. 이 도구를 구현함으로써 AI가 복잡한 데이터 분석 쿼리를 수행할 수 있게 됩니다.

## 구현 단계

### 1. 집계 파이프라인 스키마 정의

`src/mongodb/schema.ts` 파일에 집계 파이프라인 스키마를 추가합니다:

```typescript
// 기존 코드에 추가

// 집계 파이프라인 스테이지 타입
export const MongoAggregateStageSchema = z.record(z.unknown());
export type MongoAggregateStage = z.infer<typeof MongoAggregateStageSchema>;

// 집계 파이프라인 배열
export const MongoAggregatePipelineSchema = z.array(MongoAggregateStageSchema);
export type MongoAggregatePipeline = z.infer<typeof MongoAggregatePipelineSchema>;
```

### 2. AggregateTool 클래스 구현

`src/tools/documents/aggregate.ts` 파일을 생성하고 `AggregateTool` 클래스를 구현합니다:

```typescript
import { db } from "../../mongodb/client.js";
import { BaseTool, ToolParams, ToolResponse } from "../base/tool.js";
import { MongoAggregatePipeline } from "../../mongodb/schema.js";

export interface AggregateParams extends ToolParams {
  collection: string;
  pipeline: MongoAggregatePipeline;
}

export class AggregateTool extends BaseTool<AggregateParams> {
  name = "aggregate";
  description = "Execute an aggregation pipeline on a collection";
  
  inputSchema = {
    type: "object" as const,
    properties: {
      collection: {
        type: "string",
        description: "Name of the collection to aggregate",
      },
      pipeline: {
        type: "array",
        description: "MongoDB aggregation pipeline stages",
        items: {
          type: "object",
          description: "Aggregation stage (e.g. $match, $group, $project, etc.)",
        },
      },
    },
    required: ["collection", "pipeline"],
  };

  async execute(params: AggregateParams): Promise<ToolResponse> {
    try {
      const collection = this.validateCollection(params.collection);
      const pipeline = this.validateAggregatePipeline(params.pipeline);

      const results = await db
        .collection(collection)
        .aggregate(pipeline)
        .toArray();

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

  private validateAggregatePipeline(pipeline: unknown): MongoAggregatePipeline {
    if (!Array.isArray(pipeline)) {
      throw new Error("Aggregation pipeline must be an array");
    }

    if (pipeline.length === 0) {
      throw new Error("Aggregation pipeline cannot be empty");
    }

    for (const stage of pipeline) {
      if (typeof stage !== "object" || stage === null) {
        throw new Error("Each pipeline stage must be an object");
      }

      const stageKeys = Object.keys(stage);
      if (stageKeys.length === 0) {
        throw new Error("Pipeline stage cannot be empty");
      }

      // 스테이지는 보통 $로 시작하는 연산자를 포함해야 함
      if (!stageKeys.some(key => key.startsWith("$"))) {
        throw new Error(`Pipeline stage must contain an operator starting with $: ${JSON.stringify(stage)}`);
      }
    }

    return pipeline as MongoAggregatePipeline;
  }
}
```

### 3. 도구 레지스트리에 등록

`src/tools/registry.ts` 파일을 수정하여 새 도구를 등록합니다:

```typescript
// 기존 imports에 추가
import { AggregateTool } from "./documents/aggregate.js";

// ToolRegistry 클래스의 constructor 메서드 내부
constructor() {
  // 기존 도구 등록 코드...
  this.registerTool(new ListCollectionsTool());
  this.registerTool(new FindTool());
  this.registerTool(new InsertOneTool());
  this.registerTool(new UpdateOneTool());
  this.registerTool(new DeleteOneTool());
  this.registerTool(new CreateIndexTool());
  this.registerTool(new DropIndexTool());
  this.registerTool(new ListIndexesTool());
  
  // 새 도구 등록
  this.registerTool(new AggregateTool());
}
```

## 테스트 사례

### 기본 그룹핑 집계

다음은 사용자 컬렉션에서 도시별 사용자 수를 계산하는 집계 파이프라인 예제입니다:

```json
{
  "collection": "users",
  "pipeline": [
    {
      "$group": {
        "_id": "$address.city",
        "count": { "$sum": 1 }
      }
    },
    {
      "$sort": { "count": -1 }
    }
  ]
}
```

### 복잡한 집계 파이프라인

다음은 상품 가격대별 분석을 위한 더 복잡한 집계 파이프라인 예제입니다:

```json
{
  "collection": "products",
  "pipeline": [
    {
      "$match": { "inStock": true }
    },
    {
      "$bucket": {
        "groupBy": "$price",
        "boundaries": [0, 50, 100, 500, 1000, 5000],
        "default": "Other",
        "output": {
          "count": { "$sum": 1 },
          "averageRating": { "$avg": "$rating" },
          "products": { "$push": "$name" }
        }
      }
    }
  ]
}
```

## Claude 요청 예시

AI에게 다음과 같은 요청을 보내 집계 파이프라인 기능을 테스트할 수 있습니다:

```
"각 도시별로 사용자 수를 계산해서 많은 순으로 보여줘"
"전자제품 카테고리에서 평균 가격이 가장 높은 하위 카테고리 3개는 무엇인가요?"
"최근 30일 동안의 주문을 날짜별로 집계하고 일일 총 매출을 계산해줘"
```

## 주의사항

1. 집계 파이프라인은 복잡한 연산이 가능하므로, 성능에 주의해야 합니다.
2. 큰 데이터셋에서 메모리 제한을 초과할 수 있으므로, 필요한 경우 `$limit`이나 `$sample` 스테이지를 사용하세요.
3. 보안을 위해 파이프라인 검증 로직을 강화하는 것이 좋습니다.
4. 오류 메시지는 사용자 친화적이면서도 디버깅에 도움이 되도록 작성하세요. 