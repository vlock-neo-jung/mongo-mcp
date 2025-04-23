// 로그 수준 정의
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

// 로그 설정 인터페이스
interface LoggerConfig {
  level: LogLevel;
  isDevelopment: boolean;
}

// 기본 설정
const defaultConfig: LoggerConfig = {
  level: process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG,
  isDevelopment: process.env.NODE_ENV !== 'production'
};

// 로거 클래스
export class Logger {
  private config: LoggerConfig;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  // 로그 레벨 설정
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  // 개발 모드 설정
  setDevelopmentMode(isDevelopment: boolean): void {
    this.config.isDevelopment = isDevelopment;
  }

  // 로그 레벨 확인
  private shouldLog(level: LogLevel): boolean {
    const logLevels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const configLevelIndex = logLevels.indexOf(this.config.level);
    const messageLevelIndex = logLevels.indexOf(level);
    return messageLevelIndex >= configLevelIndex;
  }

  // 로그 메시지 포맷
  private formatMessage(level: LogLevel, message: string, meta?: Record<string, unknown>): string {
    const timestamp = new Date().toISOString();
    const metaString = meta ? ` ${JSON.stringify(meta)}` : '';
    
    if (this.config.isDevelopment) {
      // 개발 모드에서는 읽기 쉬운 형식으로 출력
      return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaString}`;
    } else {
      // 프로덕션 모드에서는 JSON 형식으로 출력
      return JSON.stringify({
        timestamp,
        level,
        message,
        ...meta
      });
    }
  }

  // 로그 메서드
  debug(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.debug(this.formatMessage(LogLevel.DEBUG, message, meta));
    }
  }

  info(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.info(this.formatMessage(LogLevel.INFO, message, meta));
    }
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage(LogLevel.WARN, message, meta));
    }
  }

  error(message: string, error?: unknown, meta?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const errorMeta = error ? {
        ...meta,
        error: error instanceof Error 
          ? { 
              message: error.message, 
              name: error.name, 
              stack: error.stack 
            } 
          : error
      } : meta;
      
      console.error(this.formatMessage(LogLevel.ERROR, message, errorMeta));
    }
  }
}

// 기본 로거 인스턴스 생성
export const logger = new Logger();

// 로깅 유틸리티 함수
export function createRequestLogger(requestId: string) {
  return {
    debug: (message: string, meta?: Record<string, unknown>) => 
      logger.debug(message, { requestId, ...meta }),
    info: (message: string, meta?: Record<string, unknown>) => 
      logger.info(message, { requestId, ...meta }),
    warn: (message: string, meta?: Record<string, unknown>) => 
      logger.warn(message, { requestId, ...meta }),
    error: (message: string, error?: unknown, meta?: Record<string, unknown>) => 
      logger.error(message, error, { requestId, ...meta })
  };
} 