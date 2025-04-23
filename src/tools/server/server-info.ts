import { db, client } from "../../mongodb/client.js";
import { BaseTool, ToolParams, ToolResponse } from "../base/tool.js";
import { logger } from "../../utils/logger.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

export interface ServerInfoParams extends ToolParams {
  includeDebugInfo?: boolean;
}

export class ServerInfoTool extends BaseTool<ServerInfoParams> {
  name = "serverInfo";
  description = "Get MongoDB server information including version, storage engine, and other details";
  
  inputSchema = {
    type: "object" as const,
    properties: {
      includeDebugInfo: {
        type: "boolean",
        description: "Include additional debug information about the server",
      },
    },
    required: [],
  };

  async execute(params: ServerInfoParams): Promise<ToolResponse> {
    try {
      logger.debug("Fetching server information", { 
        toolName: this.name,
        includeDebugInfo: params.includeDebugInfo
      });
      
      // 기본 서버 정보 조회
      const buildInfo = await db.command({ buildInfo: 1 });
      
      // includeDebugInfo가 true인 경우 추가 정보 조회
      let serverStatus = null;
      if (params.includeDebugInfo) {
        serverStatus = await db.command({ serverStatus: 1 });
      }
      
      // 응답 구성
      const serverInfo: Record<string, any> = {
        version: buildInfo.version,
        gitVersion: buildInfo.gitVersion,
        modules: buildInfo.modules,
        allocator: buildInfo.allocator,
        javascriptEngine: buildInfo.javascriptEngine,
        sysInfo: buildInfo.sysInfo,
        storageEngines: buildInfo.storageEngines,
        debug: buildInfo.debug,
        maxBsonObjectSize: buildInfo.maxBsonObjectSize,
        openssl: buildInfo.openssl,
        buildEnvironment: buildInfo.buildEnvironment,
        bits: buildInfo.bits,
        ok: buildInfo.ok,
        status: {},
        connectionInfo: {
          readPreference: "primary",
        },
      };
      
      // 서버 상태 정보 추가
      if (serverStatus) {
        serverInfo.status = {
          host: serverStatus.host,
          version: serverStatus.version,
          process: serverStatus.process,
          pid: serverStatus.pid,
          uptime: serverStatus.uptime,
          uptimeMillis: serverStatus.uptimeMillis,
          uptimeEstimate: serverStatus.uptimeEstimate,
          localTime: serverStatus.localTime,
          connections: serverStatus.connections,
          network: serverStatus.network,
          memory: serverStatus.mem,
          storageEngine: serverStatus.storageEngine,
          security: serverStatus.security,
        };
      }
      
      logger.debug("Server information fetched successfully", { 
        toolName: this.name,
        version: buildInfo.version
      });

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(serverInfo, null, 2) },
        ],
        isError: false,
      };
    } catch (error) {
      logger.error("Failed to get server information", error, { toolName: this.name });
      return this.handleError(error);
    }
  }
} 