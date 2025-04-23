import { db } from "../../mongodb/client.js";
import { BaseTool, ToolParams, ToolResponse } from "../base/tool.js";
import { MongoAggregatePipeline } from "../../mongodb/schema.js";
import { logger } from "../../utils/logger.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

export interface AggregateParams extends ToolParams {
  collection: string;
  pipeline: MongoAggregatePipeline;
  explain?: "queryPlanner" | "executionStats" | "allPlansExecution";
}

export class AggregateTool extends BaseTool<AggregateParams> {
  name = "aggregate";
  description = "Execute a MongoDB aggregation pipeline with optional execution plan analysis";
  
  inputSchema = {
    type: "object" as const,
    properties: {
      collection: {
        type: "string",
        description: "Name of the collection to aggregate",
      },
      pipeline: {
        type: "array",
        description: "Aggregation pipeline stages",
        items: {
          type: "object",
        },
      },
      explain: {
        type: "string",
        description: "Optional: Get aggregation execution information",
        enum: ["queryPlanner", "executionStats", "allPlansExecution"],
      },
    },
    required: ["collection", "pipeline"],
  };

  async execute(params: AggregateParams): Promise<ToolResponse> {
    try {
      const collection = this.validateCollection(params.collection);
      const pipeline = this.validateAggregatePipeline(params.pipeline);
      
      // 시스템 컬렉션 접근 방지
      if (collection.startsWith("system.")) {
        const errorMessage = "Access to system collections is not allowed";
        logger.warn(errorMessage, { toolName: this.name, collection });
        throw new McpError(ErrorCode.InvalidRequest, errorMessage);
      }

      logger.debug(`Executing aggregation on collection ${collection}`, { 
        toolName: this.name, 
        collection,
        pipelineStages: pipeline.length
      });

      // explain 옵션이 있는 경우와 없는 경우를 처리
      if (params.explain) {
        // explain 모드로 실행
        const explainResult = await db
          .collection(collection)
          .aggregate(pipeline, {
            explain: {
              verbosity: params.explain,
            },
          })
          .toArray();
        
        logger.debug(`Aggregation explain completed`, { 
          toolName: this.name, 
          collection,
          explainMode: params.explain
        });
        
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(explainResult, null, 2) },
          ],
          isError: false,
        };
      } else {
        // 일반 실행
        const results = await db
          .collection(collection)
          .aggregate(pipeline)
          .toArray();
        
        logger.debug(`Aggregation returned ${results.length} documents`, { 
          toolName: this.name, 
          collection,
          resultCount: results.length
        });
        
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(results, null, 2) },
          ],
          isError: false,
        };
      }
    } catch (error) {
      return this.handleError(error);
    }
  }

  private validateAggregatePipeline(pipeline: unknown): MongoAggregatePipeline {
    if (!Array.isArray(pipeline)) {
      const errorMessage = "Pipeline must be an array";
      logger.warn(errorMessage, { toolName: this.name, pipelineType: typeof pipeline });
      throw new McpError(ErrorCode.InvalidRequest, errorMessage);
    }

    if (pipeline.length === 0) {
      const errorMessage = "Aggregation pipeline cannot be empty";
      logger.warn(errorMessage, { toolName: this.name });
      throw new McpError(ErrorCode.InvalidRequest, errorMessage);
    }

    for (const stage of pipeline) {
      if (typeof stage !== "object" || stage === null || Array.isArray(stage)) {
        const errorMessage = "Each pipeline stage must be an object";
        logger.warn(errorMessage, { 
          toolName: this.name, 
          stageType: typeof stage, 
          isNull: stage === null, 
          isArray: Array.isArray(stage) 
        });
        throw new McpError(ErrorCode.InvalidRequest, errorMessage);
      }

      const stageKeys = Object.keys(stage);
      if (stageKeys.length === 0) {
        const errorMessage = "Pipeline stage cannot be empty";
        logger.warn(errorMessage, { toolName: this.name });
        throw new McpError(ErrorCode.InvalidRequest, errorMessage);
      }

      // 스테이지는 보통 $로 시작하는 연산자를 포함해야 함
      if (!stageKeys.some(key => key.startsWith("$"))) {
        const errorMessage = `Pipeline stage must contain an operator starting with $: ${JSON.stringify(stage)}`;
        logger.warn(errorMessage, { toolName: this.name, stageKeys });
        throw new McpError(ErrorCode.InvalidRequest, errorMessage);
      }
    }

    return pipeline as MongoAggregatePipeline;
  }
} 