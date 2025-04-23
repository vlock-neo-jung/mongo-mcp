#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { connectToMongoDB, closeMongoDB } from "./mongodb/client.js";
import { ToolRegistry } from "./tools/registry.js";
import express from "express";
import { SSEServerTransport } from "./server/sse.js";
import { SessionStore } from "./server/session-store.js";

// 인자 파싱: mongodb-url [transport-type]
// transport-type: "stdio" 또는 "sse" (기본값은 "stdio")
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("MongoDB 연결 URL을 제공해주세요");
  process.exit(1);
}

const databaseUrl = args[0];
const transportType = args[1] || "stdio";

const toolRegistry = new ToolRegistry();

// SSE 세션 관리를 위한 스토어
const sessionStore = new SessionStore();

const server = new Server(
  {
    name: "mongodb-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {
        list: true,
        call: true,
      },
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: toolRegistry.getToolSchemas(),
  _meta: {},
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name;
  const args = request.params.arguments ?? {};

  try {
    console.error(`도구 실행: ${name}`);
    console.error(`인자: ${JSON.stringify(args, null, 2)}`);

    const tool = toolRegistry.getTool(name);
    if (!tool) {
      throw new Error(`알 수 없는 도구: ${name}`);
    }

    const result = await tool.execute(args);
    return { toolResult: result };
  } catch (error) {
    console.error("작업 실패:", error);
    return {
      toolResult: {
        content: [
          {
            type: "text",
            text: error.message,
          },
        ],
        isError: true,
      },
    };
  }
});

async function runServer() {
  try {
    await connectToMongoDB(databaseUrl);
    
    if (transportType === "stdio") {
      // stdio 방식
      const transport = new StdioServerTransport();
      await server.connect(transport);
      console.error("MongoDB MCP 서버가 stdio에서 실행 중입니다");
    } 
    else if (transportType === "sse") {
      // SSE 방식 구현
      const app = express();
      app.use(express.json());
      
      // SSE 스트림을 위한 엔드포인트
      app.get('/mcp', async (req, res) => {
        console.error('SSE 스트림 연결 요청 받음');
        
        try {
          // 클라이언트를 위한 SSE 트랜스포트 생성
          const transport = new SSEServerTransport('/messages', res);
          
          // 세션 스토어에 등록
          sessionStore.registerSession(transport);
          
          // 연결 종료 시 정리 로직
          transport.onclose = () => {
            console.error(`세션 ${transport.sessionId}의 SSE 트랜스포트 종료됨`);
            sessionStore.removeSession(transport.sessionId);
          };
          
          // MCP 서버와 트랜스포트 연결
          await server.connect(transport);
          
          // SSE 트랜스포트 시작
          await transport.start();
          
          console.error(`세션 ID: ${transport.sessionId}로 SSE 스트림 설정됨`);
        } catch (error) {
          console.error('SSE 스트림 설정 오류:', error);
          if (!res.headersSent) {
            res.status(500).send('SSE 스트림 설정 오류');
          }
        }
      });
      
      // 클라이언트 메시지 수신 엔드포인트
      app.post('/messages', async (req, res) => {
        console.error('POST 요청 수신: /messages');
        
        // URL 쿼리 파라미터에서 세션 ID 추출
        const sessionId = req.query.sessionId as string | undefined;
        
        if (!sessionId) {
          console.error('요청 URL에 세션 ID가 제공되지 않음');
          res.status(400).send('sessionId 파라미터 누락');
          return;
        }
        
        // 세션 스토어에서 세션 찾기
        const transport = sessionStore.getSession(sessionId);
        
        if (!transport) {
          console.error(`세션 ID에 대한 활성 트랜스포트 없음: ${sessionId}`);
          res.status(404).send('세션을 찾을 수 없음');
          return;
        }
        
        try {
          // 세션 트랜스포트로 메시지 처리
          await transport.handlePostMessage(req, res, req.body);
        } catch (error) {
          console.error('메시지 처리 오류:', error);
          if (!res.headersSent) {
            res.status(500).send('메시지 처리 오류');
          }
        }
      });
      
      // 서버 상태 확인 엔드포인트
      app.get('/status', (req, res) => {
        res.json({
          status: 'ok',
          activeSessions: sessionStore.sessionCount,
          serverInfo: {
            name: "mongodb-mcp",
            version: "0.1.0",
            transportType: "sse"
          }
        });
      });
      
      const PORT = process.env.PORT || 3000;
      app.listen(PORT, () => {
        console.error(`MongoDB MCP 서버가 SSE로 포트 ${PORT}에서 실행 중입니다`);
      });
    }
    else {
      console.error(`지원하지 않는 transport 타입: ${transportType}`);
      process.exit(1);
    }
  } catch (error) {
    console.error("서버 시작 실패:", error);
    process.exit(1);
  }
}

process.on("SIGINT", async () => {
  try {
    if (transportType === "sse") {
      // SSE 세션 정리
      await sessionStore.closeAllSessions();
    }
    await closeMongoDB();
  } finally {
    process.exit(0);
  }
});

process.on("unhandledRejection", (error) => {
  console.error("처리되지 않은 프로미스 거부:", error);
  process.exit(1);
});

runServer().catch(console.error);
