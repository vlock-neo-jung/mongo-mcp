import { SSEServerTransport } from "./sse.js";

/**
 * 활성 SSE 세션을 관리하는 저장소
 */
export class SessionStore {
  private sessions: Map<string, SSEServerTransport> = new Map();

  /**
   * 새 세션 등록
   */
  registerSession(transport: SSEServerTransport): void {
    this.sessions.set(transport.sessionId, transport);
    console.error(`세션 등록됨: ${transport.sessionId}`);
  }

  /**
   * 세션ID로 세션 검색
   */
  getSession(sessionId: string): SSEServerTransport | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * 세션 제거
   */
  removeSession(sessionId: string): boolean {
    console.error(`세션 제거됨: ${sessionId}`);
    return this.sessions.delete(sessionId);
  }

  /**
   * 활성 세션 수 반환
   */
  get sessionCount(): number {
    return this.sessions.size;
  }

  /**
   * 모든 세션 종료
   */
  async closeAllSessions(): Promise<void> {
    console.error(`${this.sessions.size}개의 활성 세션 종료 중...`);
    const closePromises = Array.from(this.sessions.values()).map(transport => {
      return transport.close().catch(err => {
        console.error(`세션 종료 오류: ${err.message}`);
      });
    });
    
    await Promise.all(closePromises);
    this.sessions.clear();
    console.error('모든 세션이 종료됨');
  }
} 