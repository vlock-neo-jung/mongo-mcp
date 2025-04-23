import { BaseTool } from "./base/tool.js";
import { ListCollectionsTool } from "./collection/list-collections.js";
import { DeleteTool } from "./documents/delete.js";
import { FindTool } from "./documents/find.js";
import { InsertTool } from "./documents/insert.js";
import { UpdateTool } from "./documents/update.js";
import { CreateIndexTool } from "./indexes/create-index.js";
import { DropIndexTool } from "./indexes/drop-index.js";
import { ListIndexesTool } from "./indexes/list-indexes.js";
import { McpError, ErrorCode, Tool } from "@modelcontextprotocol/sdk/types.js";
import { logger } from "../utils/logger.js";

// 새로운 도구 import
import { AggregateTool } from "./documents/aggregate.js";
import { CountTool } from "./documents/count.js";
import { DistinctTool } from "./documents/distinct.js";
import { ServerInfoTool } from "./server/server-info.js";

export class ToolRegistry {
  private tools: Map<string, BaseTool<any>> = new Map();

  constructor() {
    this.registerTool(new ListCollectionsTool());
    this.registerTool(new FindTool());
    this.registerTool(new InsertTool());
    this.registerTool(new UpdateTool());
    this.registerTool(new DeleteTool());
    this.registerTool(new CreateIndexTool());
    this.registerTool(new DropIndexTool());
    this.registerTool(new ListIndexesTool());
    
    // 새로운 도구 등록
    this.registerTool(new AggregateTool());
    this.registerTool(new CountTool());
    this.registerTool(new DistinctTool());
    this.registerTool(new ServerInfoTool());
    
    // @sample 호환성 검사
    this.verifyToolCompatibility();
  }

  registerTool(tool: BaseTool<any>) {
    this.tools.set(tool.name, tool);
    logger.debug(`Registered tool: ${tool.name}`, { toolName: tool.name });
  }

  getTool(name: string): BaseTool<any> | undefined {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    return tool;
  }

  getAllTools(): BaseTool<any>[] {
    return Array.from(this.tools.values());
  }

  getToolSchemas(): Tool[] {
    return this.getAllTools().map((tool) => {
      const inputSchema = tool.inputSchema as any;
      return {
        name: tool.name,
        description: tool.description,
        inputSchema: {
          type: "object",
          properties: inputSchema.properties || {},
          ...(inputSchema.required && { required: inputSchema.required }),
        },
      };
    });
  }
  
  // @sample 호환성 검사
  private verifyToolCompatibility() {
    // 필수 도구 이름 목록
    const requiredToolNames = [
      "query",       // 이전 이름: find
      "update",      // UpdateOneTool
      "insert",      // InsertTool
      "aggregate",   // AggregateTool
      "count",       // CountTool
      "distinct",    // DistinctTool
      "createIndex", // CreateIndexTool
      "listCollections", // ListCollectionsTool
      "serverInfo"   // ServerInfoTool
    ];
    
    // 등록된 도구 이름 목록
    const registeredToolNames = Array.from(this.tools.keys());
    
    // 누락된 도구 찾기
    const missingTools = requiredToolNames.filter(name => !registeredToolNames.includes(name));
    
    if (missingTools.length > 0) {
      logger.warn(`Missing required tools for @sample compatibility: ${missingTools.join(', ')}`, {
        missingTools,
        registeredTools: registeredToolNames
      });
    } else {
      logger.info("All required tools for @sample compatibility are registered");
    }
  }
}
