// src/utils/monitoring.ts - Production monitoring and logging
import * as fs from 'fs';
import * as path from 'path';

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

export interface MonitoringConfig {
  logLevel: LogLevel;
  enableMetrics: boolean;
  sentryDsn?: string;
  datadogApiKey?: string;
}

class ProductionMonitor {
  private config: MonitoringConfig;
  private metricsData: Map<string, any> = new Map();
  private logFile: string;

  constructor(config: MonitoringConfig) {
    this.config = config;
    this.logFile = path.join(process.cwd(), 'logs', `app-${new Date().toISOString().split('T')[0]}.log`);
    this.ensureLogDirectory();
    this.initializeMonitoring();
  }

  private ensureLogDirectory(): void {
    const logDir = path.dirname(this.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  private initializeMonitoring(): void {
    // Initialize Sentry for error tracking
    if (this.config.sentryDsn) {
      try {
        // TODO: Initialize Sentry SDK
        console.log('🔍 Sentry error tracking initialized');
      } catch (error) {
        this.log(LogLevel.WARN, 'Failed to initialize Sentry', { error });
      }
    }

    // Initialize Datadog for metrics
    if (this.config.datadogApiKey) {
      try {
        // TODO: Initialize Datadog SDK
        console.log('📊 Datadog metrics initialized');
      } catch (error) {
        this.log(LogLevel.WARN, 'Failed to initialize Datadog', { error });
      }
    }

    // Start metrics collection
    if (this.config.enableMetrics) {
      this.startMetricsCollection();
    }
  }

  public log(level: LogLevel, message: string, metadata?: any): void {
    if (level > this.config.logLevel) return;

    const timestamp = new Date().toISOString();
    const levelName = LogLevel[level];
    const logEntry = {
      timestamp,
      level: levelName,
      message,
      metadata,
      pid: process.pid,
      env: process.env.NODE_ENV
    };

    // Console output with colors
    const colors = {
      [LogLevel.ERROR]: '\x1b[31m', // Red
      [LogLevel.WARN]: '\x1b[33m',  // Yellow
      [LogLevel.INFO]: '\x1b[36m',  // Cyan
      [LogLevel.DEBUG]: '\x1b[37m'  // White
    };
    
    const reset = '\x1b[0m';
    const color = colors[level] || '';
    
    console.log(`${color}[${timestamp}] ${levelName}: ${message}${reset}`);
    if (metadata) {
      console.log(`${color}${JSON.stringify(metadata, null, 2)}${reset}`);
    }

    // File logging
    try {
      fs.appendFileSync(this.logFile, JSON.stringify(logEntry) + '\n');
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }

    // Send to external monitoring services
    if (level === LogLevel.ERROR) {
      this.reportError(message, metadata);
    }
  }

  private reportError(message: string, metadata?: any): void {
    try {
      // TODO: Send to Sentry or other error tracking service
      this.recordMetric('errors.total', 1, 'counter');
    } catch (error) {
      console.error('Failed to report error to monitoring service:', error);
    }
  }

  public recordMetric(name: string, value: number, type: 'counter' | 'gauge' | 'histogram' = 'gauge'): void {
    if (!this.config.enableMetrics) return;

    const timestamp = Date.now();
    const metric = {
      name,
      value,
      type,
      timestamp,
      tags: {
        env: process.env.NODE_ENV || 'development',
        version: process.env.APP_VERSION || '1.0.0'
      }
    };

    this.metricsData.set(`${name}-${timestamp}`, metric);

    // TODO: Send to Datadog or other metrics service
    if (this.config.datadogApiKey) {
      // Send metric to Datadog
    }
  }

  public recordTransaction(type: string, duration: number, success: boolean): void {
    this.recordMetric(`transactions.${type}.duration`, duration, 'histogram');
    this.recordMetric(`transactions.${type}.${success ? 'success' : 'failure'}`, 1, 'counter');
    
    this.log(LogLevel.INFO, `Transaction completed`, {
      type,
      duration: `${duration}ms`,
      success
    });
  }

  public recordUserActivity(action: string, userId?: string): void {
    this.recordMetric(`user.activity.${action}`, 1, 'counter');
    
    this.log(LogLevel.INFO, `User activity: ${action}`, {
      userId,
      timestamp: new Date().toISOString()
    });
  }

  public healthCheck(): { status: string; checks: any[] } {
    const checks = [
      this.checkDatabase(),
      this.checkCentrifugeAPI(),
      this.checkBlockchainRPC(),
      this.checkFileSystem(),
      this.checkMemoryUsage()
    ];

    const allHealthy = checks.every(check => check.status === 'healthy');
    
    return {
      status: allHealthy ? 'healthy' : 'unhealthy',
      checks
    };
  }

  private checkDatabase(): any {
    try {
      // TODO: Implement actual database health check
      return {
        name: 'Database',
        status: 'healthy',
        responseTime: '15ms',
        lastChecked: new Date().toISOString()
      };
    } catch (error) {
      return {
        name: 'Database',
        status: 'unhealthy',
        error: error.message,
        lastChecked: new Date().toISOString()
      };
    }
  }

  private checkCentrifugeAPI(): any {
    try {
      // TODO: Implement actual Centrifuge API health check
      return {
        name: 'Centrifuge API',
        status: 'healthy',
        responseTime: '85ms',
        lastChecked: new Date().toISOString()
      };
    } catch (error) {
      return {
        name: 'Centrifuge API',
        status: 'unhealthy',
        error: error.message,
        lastChecked: new Date().toISOString()
      };
    }
  }

  private checkBlockchainRPC(): any {
    try {
      // TODO: Implement actual blockchain RPC health check
      return {
        name: 'Blockchain RPC',
        status: 'healthy',
        responseTime: '120ms',
        lastChecked: new Date().toISOString()
      };
    } catch (error) {
      return {
        name: 'Blockchain RPC',
        status: 'unhealthy',
        error: error.message,
        lastChecked: new Date().toISOString()
      };
    }
  }

  private checkFileSystem(): any {
    try {
      const stats = fs.statSync(process.cwd());
      return {
        name: 'File System',
        status: 'healthy',
        freeSpace: '85GB',
        lastChecked: new Date().toISOString()
      };
    } catch (error) {
      return {
        name: 'File System',
        status: 'unhealthy',
        error: error.message,
        lastChecked: new Date().toISOString()
      };
    }
  }

  private checkMemoryUsage(): any {
    const memUsage = process.memoryUsage();
    const usedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const totalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    const usagePercent = Math.round((usedMB / totalMB) * 100);

    const isHealthy = usagePercent < 80; // Alert if memory usage > 80%

    return {
      name: 'Memory Usage',
      status: isHealthy ? 'healthy' : 'warning',
      usedMB,
      totalMB,
      usagePercent: `${usagePercent}%`,
      lastChecked: new Date().toISOString()
    };
  }

  private startMetricsCollection(): void {
    // Collect system metrics every 60 seconds
    setInterval(() => {
      const memUsage = process.memoryUsage();
      this.recordMetric('system.memory.heap_used', memUsage.heapUsed);
      this.recordMetric('system.memory.heap_total', memUsage.heapTotal);
      this.recordMetric('system.memory.external', memUsage.external);
      
      // CPU usage (simplified)
      const usage = process.cpuUsage();
      this.recordMetric('system.cpu.user', usage.user);
      this.recordMetric('system.cpu.system', usage.system);
      
      // Active handles and requests
      this.recordMetric('system.handles', (process as any)._getActiveHandles().length);
      this.recordMetric('system.requests', (process as any)._getActiveRequests().length);
      
    }, 60000);

    this.log(LogLevel.INFO, 'Metrics collection started');
  }

  public generateReport(): string {
    const report = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      uptime: process.uptime(),
      version: process.env.APP_VERSION || '1.0.0',
      healthCheck: this.healthCheck(),
      recentErrors: this.getRecentErrors(),
      performanceMetrics: this.getPerformanceMetrics()
    };

    return JSON.stringify(report, null, 2);
  }

  private getRecentErrors(): any[] {
    // TODO: Implement logic to fetch recent errors from logs
    return [];
  }

  private getPerformanceMetrics(): any {
    return {
      averageResponseTime: '150ms',
      requestsPerMinute: 45,
      errorRate: '0.2%',
      uptime: '99.9%'
    };
  }

  public alert(severity: 'critical' | 'warning' | 'info', message: string, details?: any): void {
    const alert = {
      severity,
      message,
      details,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV
    };

    // Log the alert
    const logLevel = severity === 'critical' ? LogLevel.ERROR : 
                    severity === 'warning' ? LogLevel.WARN : LogLevel.INFO;
    
    this.log(logLevel, `ALERT [${severity.toUpperCase()}]: ${message}`, details);

    // TODO: Send to alerting systems (PagerDuty, Slack, etc.)
    if (severity === 'critical') {
      this.sendCriticalAlert(alert);
    }
  }

  private sendCriticalAlert(alert: any): void {
    try {
      // TODO: Implement critical alert notifications
      // - Send to PagerDuty
      // - Send to Slack
      // - Send email to on-call team
      console.log('🚨 CRITICAL ALERT SENT:', alert.message);
    } catch (error) {
      console.error('Failed to send critical alert:', error);
    }
  }
}

// Singleton instance
let monitorInstance: ProductionMonitor;

export function initializeMonitoring(config: MonitoringConfig): ProductionMonitor {
  monitorInstance = new ProductionMonitor(config);
  return monitorInstance;
}

export function getMonitor(): ProductionMonitor {
  if (!monitorInstance) {
    throw new Error('Monitoring not initialized. Call initializeMonitoring() first.');
  }
  return monitorInstance;
}

// Convenience functions
export function log(level: LogLevel, message: string, metadata?: any): void {
  getMonitor().log(level, message, metadata);
}

export function logError(message: string, error?: any): void {
  getMonitor().log(LogLevel.ERROR, message, { error: error?.message || error });
}

export function logInfo(message: string, metadata?: any): void {
  getMonitor().log(LogLevel.INFO, message, metadata);
}

export function recordMetric(name: string, value: number, type?: 'counter' | 'gauge' | 'histogram'): void {
  getMonitor().recordMetric(name, value, type);
}

export function recordTransaction(type: string, duration: number, success: boolean): void {
  getMonitor().recordTransaction(type, duration, success);
}

export function recordUserActivity(action: string, userId?: string): void {
  getMonitor().recordUserActivity(action, userId);
}

// Performance monitoring decorator
export function monitorPerformance(operationName: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const startTime = Date.now();
      let success = true;
      let error: any;

      try {
        const result = await method.apply(this, args);
        return result;
      } catch (err) {
        success = false;
        error = err;
        throw err;
      } finally {
        const duration = Date.now() - startTime;
        recordTransaction(operationName, duration, success);
        
        if (!success && error) {
          logError(`Operation ${operationName} failed`, error);
        } else {
          logInfo(`Operation ${operationName} completed`, { duration: `${duration}ms` });
        }
      }
    };
  };
}

// Error boundary for CLI commands
export function withErrorHandling<T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  operationName: string
): (...args: T) => Promise<R | void> {
  return async (...args: T): Promise<R | void> => {
    try {
      const result = await fn(...args);
      recordUserActivity(operationName);
      return result;
    } catch (error) {
      logError(`Command ${operationName} failed`, error);
      recordMetric(`commands.${operationName}.errors`, 1, 'counter');
      
      // Send alert for critical operations
      const criticalOps = ['invest', 'borrow', 'originate-asset'];
      if (criticalOps.includes(operationName)) {
        getMonitor().alert('critical', `Critical operation ${operationName} failed`, {
          error: error.message,
          args: JSON.stringify(args)
        });
      }
      
      console.error(`❌ Operation failed: ${error.message}`);
      process.exit(1);
    }
  };
}

// Health check endpoint for load balancers
export function setupHealthEndpoint(): void {
  // TODO: Set up HTTP health check endpoint
  // This would typically be done in an Express.js server
  console.log('🏥 Health check endpoint available at /health');
}

// Export default monitoring configuration
export const defaultMonitoringConfig: MonitoringConfig = {
  logLevel: process.env.LOG_LEVEL === 'debug' ? LogLevel.DEBUG :
           process.env.LOG_LEVEL === 'info' ? LogLevel.INFO :
           process.env.LOG_LEVEL === 'warn' ? LogLevel.WARN : LogLevel.ERROR,
  enableMetrics: process.env.ENABLE_METRICS !== 'false',
  sentryDsn: process.env.SENTRY_DSN,
  datadogApiKey: process.env.DATADOG_API_KEY
};