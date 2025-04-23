import { Request, Response } from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { v4 as uuidv4 } from 'uuid';

export class SSEServerTransport implements Transport {
  public readonly sessionId: string;
  private messageEndpoint: string;
  private response: Response;
  private closed = false;
  
  // Transport 인터페이스 구현
  public onclose?: () => void;
  public onerror?: (error: Error) => void;
  public onmessage?: (message: JSONRPCMessage) => void;

  constructor(messageEndpoint: string, response: Response) {
    this.sessionId = uuidv4();
    this.messageEndpoint = messageEndpoint;
    this.response = response;

    // SSE 헤더 설정
    this.response.setHeader('Content-Type', 'text/event-stream');
    this.response.setHeader('Cache-Control', 'no-cache');
    this.response.setHeader('Connection', 'keep-alive');
    this.response.setHeader('X-Accel-Buffering', 'no'); // 프록시 버퍼링 비활성화

    // 클라이언트 연결 종료 처리
    this.response.on('close', () => {
      if (!this.closed) {
        this.closed = true;
        if (this.onclose) this.onclose();
      }
    });
  }

  async start(): Promise<void> {
    if (this.closed) {
      throw new Error('Transport is closed');
    }

    // 초기 엔드포인트 이벤트 전송
    const endpoint = `${this.messageEndpoint}?sessionId=${this.sessionId}`;
    this.sendEvent('endpoint', JSON.stringify({ endpoint }));
  }

  async handlePostMessage(req: Request, res: Response, message: JSONRPCMessage): Promise<void> {
    if (this.closed) {
      throw new Error('Transport is closed');
    }

    try {
      // 메시지 수신 핸들러 호출
      if (this.onmessage) {
        this.onmessage(message);
      }
      
      // 응답은 컨텍스트가 비동기적으로 처리할 것이므로 성공 응답만 반환
      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error handling message:', error);
      if (this.onerror && error instanceof Error) {
        this.onerror(error);
      }
      
      res.status(500).json({
        error: {
          code: -32000,
          message: 'Server error',
        },
      });
    }
  }

  async close(): Promise<void> {
    if (!this.closed) {
      this.closed = true;
      
      try {
        // 종료 이벤트 전송 및 SSE 연결 종료
        this.sendEvent('close', JSON.stringify({ reason: 'Server closing connection' }));
        this.response.end();
      } catch (error) {
        console.error('Error closing SSE transport:', error);
        if (this.onerror && error instanceof Error) {
          this.onerror(error);
        }
      }
      
      if (this.onclose) this.onclose();
    }
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (this.closed) {
      throw new Error('Transport is closed');
    }

    this.sendEvent('message', JSON.stringify(message));
  }

  private sendEvent(event: string, data: string): void {
    try {
      this.response.write(`event: ${event}\n`);
      this.response.write(`data: ${data}\n\n`);
      // flush 메소드가 없으므로 제거
    } catch (error) {
      console.error('Error sending SSE event:', error);
      if (this.onerror && error instanceof Error) {
        this.onerror(error);
      }
      this.close().catch(console.error);
    }
  }
} 