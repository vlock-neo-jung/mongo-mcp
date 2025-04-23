# ServerInfoTool 구현 가이드

이 문서는 MongoDB MCP 서버에 서버 정보 조회 기능을 추가하기 위한 `ServerInfoTool` 구현 방법을 설명합니다.

## 개요

`ServerInfoTool`은 MongoDB 서버의 다양한 정보(버전, 상태, 통계 등)를 조회할 수 있는 도구입니다. 이 도구를 통해 사용자는 MongoDB 서버의 상태를 모니터링하고 진단할 수 있습니다.

## 구현 단계

### 1. ServerInfoTool 클래스 구현

`src/tools/server/server-info.ts` 파일을 생성하고 `ServerInfoTool` 클래스를 구현합니다:

```typescript
import { db, client } from "../../mongodb/client.js";
import { BaseTool, ToolParams, ToolResponse } from "../base/tool.js";

export interface ServerInfoParams extends ToolParams {
  command?: string;
}

export class ServerInfoTool extends BaseTool<ServerInfoParams> {
  name = "serverInfo";
  description = "Retrieve MongoDB server information and statistics";
  
  inputSchema = {
    type: "object" as const,
    properties: {
      command: {
        type: "string",
        description: "Specific server command to run (status, buildInfo, listDatabases, serverStatus)",
        enum: ["status", "buildInfo", "listDatabases", "serverStatus"],
        default: "status",
      },
    },
    required: [],
  };

  async execute(params: ServerInfoParams): Promise<ToolResponse> {
    try {
      const command = params.command || "status";
      let result: any;

      switch (command) {
        case "status":
          result = await this.getServerStatus();
          break;
        case "buildInfo":
          result = await this.getBuildInfo();
          break;
        case "listDatabases":
          result = await this.listDatabases();
          break;
        case "serverStatus":
          result = await this.getServerStatusDetailed();
          break;
        default:
          result = await this.getServerStatus();
      }

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

  private async getServerStatus(): Promise<any> {
    try {
      // 기본 서버 정보 조회
      const buildInfo = await client.db("admin").command({ buildInfo: 1 });
      const serverStatus = await client.db("admin").command({ serverStatus: 1 });
      const listDatabases = await client.db("admin").command({ listDatabases: 1 });

      // 필요한 정보만 추출
      return {
        version: buildInfo.version,
        uptime: serverStatus.uptime,
        uptimeMillis: serverStatus.uptimeMillis,
        localTime: serverStatus.localTime,
        connections: serverStatus.connections,
        databases: listDatabases.databases.length,
        totalSize: Math.round(listDatabases.totalSize / (1024 * 1024)) + " MB",
        ok: serverStatus.ok,
      };
    } catch (error) {
      console.error("Error fetching server status:", error);
      throw error;
    }
  }

  private async getBuildInfo(): Promise<any> {
    try {
      return await client.db("admin").command({ buildInfo: 1 });
    } catch (error) {
      console.error("Error fetching build info:", error);
      throw error;
    }
  }

  private async listDatabases(): Promise<any> {
    try {
      const result = await client.db("admin").command({ listDatabases: 1 });
      
      // 각 데이터베이스의 컬렉션 수 추가
      for (const database of result.databases) {
        try {
          const collections = await client
            .db(database.name)
            .listCollections()
            .toArray();
          database.collections = collections.length;
        } catch (e) {
          database.collections = "Access denied";
        }
      }
      
      return result;
    } catch (error) {
      console.error("Error listing databases:", error);
      throw error;
    }
  }

  private async getServerStatusDetailed(): Promise<any> {
    try {
      return await client.db("admin").command({ serverStatus: 1 });
    } catch (error) {
      console.error("Error fetching detailed server status:", error);
      throw error;
    }
  }
}
```

### 2. 도구 레지스트리에 등록

`src/tools/registry.ts` 파일을 수정하여 새 도구를 등록합니다:

```typescript
// 기존 imports에 추가
import { ServerInfoTool } from "./server/server-info.js";

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
  this.registerTool(new ServerInfoTool());
}
```

### 3. 디렉토리 구조 업데이트

필요한 경우 새로운 디렉토리를 생성합니다:

```bash
mkdir -p src/tools/server
```

## 보안 고려사항

서버 정보 조회는 민감한 시스템 정보를 노출할 수 있으므로 다음 사항을 고려하세요:

1. 운영 환경에서는 민감한 정보를 필터링하거나 마스킹합니다.
2. 필요한 정보만 반환하도록 제한합니다.
3. 접근 제어를 통해 관리자만 특정 명령을 실행할 수 있도록 합니다.

## 예제 사용법

다음 예시를 통해 `ServerInfoTool`을 사용할 수 있습니다:

### 1. 기본 서버 상태 조회

```json
{
  "name": "serverInfo"
}
```

응답 예시:
```json
{
  "version": "6.0.1",
  "uptime": 12345,
  "uptimeMillis": 12345678,
  "localTime": "2023-06-15T10:30:00Z",
  "connections": {
    "current": 5,
    "available": 995,
    "totalCreated": 10
  },
  "databases": 3,
  "totalSize": "256 MB",
  "ok": 1
}
```

### 2. 특정 명령 실행 - 데이터베이스 목록 조회

```json
{
  "name": "serverInfo",
  "command": "listDatabases"
}
```

응답 예시:
```json
{
  "databases": [
    {
      "name": "admin",
      "sizeOnDisk": 32768,
      "empty": false,
      "collections": 2
    },
    {
      "name": "test",
      "sizeOnDisk": 268435456,
      "empty": false,
      "collections": 5
    }
  ],
  "totalSize": 268468224,
  "ok": 1
}
```

### 3. 특정 명령 실행 - 빌드 정보 조회

```json
{
  "name": "serverInfo",
  "command": "buildInfo"
}
```

응답 예시:
```json
{
  "version": "6.0.1",
  "gitVersion": "1234567890abcdef1234567890abcdef",
  "modules": [],
  "allocator": "tcmalloc",
  "javascriptEngine": "mozjs",
  "sysInfo": "deprecated",
  "versionArray": [
    6,
    0,
    1,
    0
  ],
  "openssl": {
    "running": "OpenSSL 1.1.1f 31 Mar 2020",
    "compiled": "OpenSSL 1.1.1f 31 Mar 2020"
  },
  "buildEnvironment": {
    "distmod": "ubuntu2004",
    "distarch": "x86_64",
    "cc": "/opt/mongodbtoolchain/v3/bin/gcc",
    "ccflags": "-fno-omit-frame-pointer -fno-strict-aliasing -ggdb",
    "cxx": "/opt/mongodbtoolchain/v3/bin/g++",
    "cxxflags": "-fno-omit-frame-pointer -fno-strict-aliasing -ggdb",
    "linkflags": "-Wl,--fatal-warnings -pthread -Wl,-z,now -fuse-ld=gold -fno-omit-frame-pointer",
    "target_arch": "x86_64",
    "target_os": "linux"
  },
  "bits": 64,
  "debug": false,
  "maxBsonObjectSize": 16777216,
  "storageEngines": [
    "devnull",
    "ephemeralForTest",
    "wiredTiger"
  ],
  "ok": 1
}
```

## Claude에게 제시할 질문 예시

사용자가 AI와 대화할 때 다음과 같은 질문을 사용하여 `ServerInfoTool`을 테스트할 수 있습니다:

1. "MongoDB 서버 버전과 가동 시간을 알려줘"
2. "현재 MongoDB 서버에 있는 데이터베이스 목록을 보여줘"
3. "MongoDB 서버의 현재 연결 상태는 어떤가요?"
4. "MongoDB 서버의 상세 정보를 확인하고 싶어요"
5. "데이터베이스의 총 용량은 얼마인가요?"

## 주의사항

1. 서버 상태 조회 명령은 데이터베이스 성능에 영향을 줄 수 있으므로, 자주 실행하지 않도록 주의하세요.
2. 상세 서버 상태(`serverStatus` 명령)는 많은 정보를 반환하므로, 필요한 정보만 추출하여 보여주는 것이 좋습니다.
3. 인증이 필요한 데이터베이스에서는 적절한 권한이 있는지 확인하세요. 