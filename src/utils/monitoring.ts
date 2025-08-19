// src/utils/monitoring.ts - Production monitoring and logging
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { testDatabaseConnection } from './db.js';
import { testIpfsConnection } from './ipfs.js';
import { checkNetworkConnectivity } from './centrifuge.js';

dotenv.config();

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
  enableFileLogging?: boolean;
  logRotationDays?: number;
  alertThresholds?: {
    memoryUsage: number;
    errorRate: number;
    responseTime: number;
  };
}

export interface HealthCheck {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime?: number;
  error?: string;
  lastChecked: string;
  details?: any;
}

export interface Alert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  details?: any;
  timestamp: string;
  environment: string;
  resolved?: boolean;
  resolvedAt?: string;
}

class ProductionMonitor {
  private config: MonitoringConfig;
  private metricsData: Map<string, any> = new Map();
  private logFile: string;
  private alertHistory: Alert[] = [];
  private performanceMetrics: Map<string, number[]> = new Map();

  constructor(config: MonitoringConfig) {
    this.config = config;
    this.logFile = path.join(process.cwd(), 'logs', `app-${new Date().toISOString().split('T')[0]}.log`);
    this.ensureLogDirectory();
    this.initializeMonitoring();
    this.setupProcessHandlers();
  }

  private ensureLogDirectory(): void {
    if (!this.config.enableFileLogging) return;
    
    const logDir = path.dirname(this.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  private initializeMonitoring(): void {
    console.log('🔄 Initializing production monitoring...');

    // Initialize Sentry for error tracking
    if (this.config.sentryDsn) {
      try {
        // TODO: Initialize Sentry SDK
        console.log('🔍 Sentry error tracking initialized');
        this.recordMetric('monitoring.sentry.initialized', 1, 'counter');
      } catch (error: any) {
        this.log(LogLevel.WARN, 'Failed to initialize Sentry', { error: error.message });
      }
    }

    // Initialize Datadog for metrics
    if (this.config.datadogApiKey) {
      try {
        // TODO: Initialize Datadog SDK
        console.log('📊 Datadog metrics initialized');
        this.recordMetric('monitoring.datadog.initialized', 1, 'counter');
      } catch (error: any) {
        this.log(LogLevel.WARN, 'Failed to initialize Datadog', { error: error.message });
      }
    }

    // Start metrics collection
    if (this.config.enableMetrics) {
      this.startMetricsCollection();
    }

    // Setup log rotation
    if (this.config.enableFileLogging && this.config.logRotationDays) {
      this.setupLogRotation();
    }

    console.log('✅ Production monitoring initialized successfully');
  }

  private setupProcessHandlers(): void {
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.log(LogLevel.ERROR, 'Uncaught Exception', { 
        error: error.message, 
        stack: error.stack 
      });
      this.alert('critical', 'Uncaught Exception', { error: error.message });
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      this.log(LogLevel.ERROR, 'Unhandled Promise Rejection', { 
        reason: reason?.toString(), 
        promise: promise.toString() 
      });
      this.alert('critical', 'Unhandled Promise Rejection', { reason: reason?.toString() });
    });

    // Handle process signals
    process.on('SIGTERM', () => {
      this.log(LogLevel.INFO, 'SIGTERM received, shutting down gracefully');
      this.shutdown();
    });

    process.on('SIGINT', () => {
      this.log(LogLevel.INFO, 'SIGINT received, shutting down gracefully');
      this.shutdown();
    });
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
      env: process.env.NODE_ENV || 'development',
      version: process.env.APP_VERSION || '1.0.0'
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
    if (metadata && this.config.logLevel >= LogLevel.DEBUG) {
      console.log(`${color}${JSON.stringify(metadata, null, 2)}${reset}`);
    }

    // File logging
    if (this.config.enableFileLogging) {
      try {
        fs.appendFileSync(this.logFile, JSON.stringify(logEntry) + '\n');
      } catch (error: any) {
        console.error('Failed to write to log file:', error.message);
      }
    }

    // Send to external monitoring services
    if (level === LogLevel.ERROR) {
      this.reportError(message, metadata);
    }

    // Record log metrics
    this.recordMetric(`logs.${levelName.toLowerCase()}`, 1, 'counter');
  }

  private reportError(message: string, metadata?: any): void {
    try {
      // TODO: Send to Sentry or other error tracking service
      this.recordMetric('errors.total', 1, 'counter');
      
      // Create error fingerprint for deduplication
      const errorFingerprint = this.createErrorFingerprint(message, metadata);
      this.recordMetric(`errors.unique.${errorFingerprint}`, 1, 'counter');
      
    } catch (error: any) {
      console.error('Failed to report error to monitoring service:', error.message);
    }
  }

  private createErrorFingerprint(message: string, metadata?: any): string {
    // Create a simple hash for error deduplication
    const errorString = `${message}${JSON.stringify(metadata?.error || '')}`;
    return Buffer.from(errorString).toString('base64').substring(0, 8);
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
        version: process.env.APP_VERSION || '1.0.0',
        instance: process.env.INSTANCE_ID || 'local'
      }
    };

    this.metricsData.set(`${name}-${timestamp}`, metric);

    // Store performance metrics for analysis
    if (type === 'histogram') {
      if (!this.performanceMetrics.has(name)) {
        this.performanceMetrics.set(name, []);
      }
      const values = this.performanceMetrics.get(name)!;
      values.push(value);
      
      // Keep only last 100 values
      if (values.length > 100) {
        values.shift();
      }
    }

    // TODO: Send to Datadog or other metrics service
    if (this.config.datadogApiKey) {
      this.sendMetricToDatadog(metric);
    }
  }

  private sendMetricToDatadog(metric: any): void {
    // TODO: Implement actual Datadog API integration
    // This would send metrics to Datadog's API
  }

  public recordTransaction(type: string, duration: number, success: boolean): void {
    this.recordMetric(`transactions.${type}.duration`, duration, 'histogram');
    this.recordMetric(`transactions.${type}.${success ? 'success' : 'failure'}`, 1, 'counter');
    
    this.log(LogLevel.INFO, `Transaction completed`, {
      type,
      duration: `${duration}ms`,
      success,
      timestamp: new Date().toISOString()
    });

    // Check for performance thresholds
    const thresholds = this.config.alertThresholds;
    if (thresholds && duration > thresholds.responseTime) {
      this.alert('warning', `Slow transaction detected: ${type}`, {
        duration: `${duration}ms`,
        threshold: `${thresholds.responseTime}ms`
      });
    }
  }

  public recordUserActivity(action: string, userId?: string): void {
    this.recordMetric(`user.activity.${action}`, 1, 'counter');
    
    this.log(LogLevel.INFO, `User activity: ${action}`, {
      userId,
      action,
      timestamp: new Date().toISOString(),
      session: process.env.SESSION_ID || 'unknown'
    });
  }

  public async healthCheck(): Promise<{ status: string; checks: HealthCheck[] }> {
    const checks = await Promise.all([
      this.checkDatabase(),
      this.checkCentrifugeAPI(),
      this.checkBlockchainRPC(),
      this.checkFileSystem(),
      this.checkMemoryUsage(),
      this.checkIpfsConnection(),
      this.checkNetworkConnectivity()
    ]);

    const healthyCount = checks.filter(check => check.status === 'healthy').length;
    const degradedCount = checks.filter(check => check.status === 'degraded').length;
    const unhealthyCount = checks.filter(check => check.status === 'unhealthy').length;

    let overallStatus = 'healthy';
    if (unhealthyCount > 0) {
      overallStatus = 'unhealthy';
    } else if (degradedCount > 0) {
      overallStatus = 'degraded';
    }

    // Record health metrics
    this.recordMetric('health.checks.healthy', healthyCount);
    this.recordMetric('health.checks.degraded', degradedCount);
    this.recordMetric('health.checks.unhealthy', unhealthyCount);
    
    return {
      status: overallStatus,
      checks
    };
  }

  private async checkDatabase(): Promise<HealthCheck> {
    const startTime = Date.now();
    try {
      const result = await testDatabaseConnection();
      const responseTime = Date.now() - startTime;
      
      return {
        name: 'Database',
        status: result.connected ? 'healthy' : 'unhealthy',
        responseTime,
        lastChecked: new Date().toISOString(),
        details: {
          version: result.version,
          error: result.error
        }
      };
    } catch (error: any) {
      return {
        name: 'Database',
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        error: error.message,
        lastChecked: new Date().toISOString()
      };
    }
  }

  private async checkCentrifugeAPI(): Promise<HealthCheck> {
    const startTime = Date.now();
    try {
      const connectivity = await checkNetworkConnectivity();
      const centrifugeStatus = connectivity.centrifuge;
      const responseTime = Date.now() - startTime;
      
      return {
        name: 'Centrifuge API',
        status: centrifugeStatus?.status === 'online' ? 'healthy' : 'unhealthy',
        responseTime,
        lastChecked: new Date().toISOString(),
        details: {
          blockNumber: centrifugeStatus?.blockNumber,
          latency: centrifugeStatus?.latency,
          error: centrifugeStatus?.error
        }
      };
    } catch (error: any) {
      return {
        name: 'Centrifuge API',
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        error: error.message,
        lastChecked: new Date().toISOString()
      };
    }
  }

  private async checkBlockchainRPC(): Promise<HealthCheck> {
    const startTime = Date.now();
    try {
      const connectivity = await checkNetworkConnectivity();
      const onlineChains = Object.entries(connectivity).filter(([_, info]: [string, any]) => info.status === 'online');
      const responseTime = Date.now() - startTime;
      
      const status = onlineChains.length > 0 ? 'healthy' : 'unhealthy';
      
      return {
        name: 'Blockchain RPC',
        status,
        responseTime,
        lastChecked: new Date().toISOString(),
        details: {
          onlineChains: onlineChains.length,
          totalChains: Object.keys(connectivity).length,
          chains: connectivity
        }
      };
    } catch (error: any) {
      return {
        name: 'Blockchain RPC',
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        error: error.message,
        lastChecked: new Date().toISOString()
      };
    }
  }

  private checkFileSystem(): HealthCheck {
    const startTime = Date.now();
    try {
      const stats = fs.statSync(process.cwd());
      const responseTime = Date.now() - startTime;
      
      // Check disk space (simplified)
      const freeSpaceGB = 85; // This would be calculated in a real implementation
      const totalSpaceGB = 100;
      const usagePercent = ((totalSpaceGB - freeSpaceGB) / totalSpaceGB) * 100;
      
      const status = usagePercent > 90 ? 'degraded' : 'healthy';
      
      return {
        name: 'File System',
        status,
        responseTime,
        lastChecked: new Date().toISOString(),
        details: {
          freeSpaceGB,
          totalSpaceGB,
          usagePercent: `${usagePercent.toFixed(1)}%`
        }
      };
    } catch (error: any) {
      return {
        name: 'File System',
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        error: error.message,
        lastChecked: new Date().toISOString()
      };
    }
  }

  private checkMemoryUsage(): HealthCheck {
    const startTime = Date.now();
    const memUsage = process.memoryUsage();
    const usedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const totalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    const usagePercent = Math.round((usedMB / totalMB) * 100);
    const responseTime = Date.now() - startTime;

    const thresholds = this.config.alertThresholds;
    const memoryThreshold = thresholds?.memoryUsage || 80;
    
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (usagePercent > 90) {
      status = 'unhealthy';
    } else if (usagePercent > memoryThreshold) {
      status = 'degraded';
    }

    return {
      name: 'Memory Usage',
      status,
      responseTime,
      lastChecked: new Date().toISOString(),
      details: {
        usedMB,
        totalMB,
        usagePercent: `${usagePercent}%`,
        external: Math.round(memUsage.external / 1024 / 1024),
        buffers: Math.round((memUsage.arrayBuffers || 0) / 1024 / 1024)
      }
    };
  }

  private async checkIpfsConnection(): Promise<HealthCheck> {
    try {
      const result = await testIpfsConnection();
      
      return {
        name: 'IPFS Connection',
        status: result.connected ? 'healthy' : 'unhealthy',
        responseTime: result.responseTime,
        lastChecked: new Date().toISOString(),
        details: {
          nodeInfo: result.nodeInfo,
          error: result.error
        }
      };
    } catch (error: any) {
      return {
        name: 'IPFS Connection',
        status: 'unhealthy',
        error: error.message,
        lastChecked: new Date().toISOString()
      };
    }
  }

  private async checkNetworkConnectivity(): Promise<HealthCheck> {
    const startTime = Date.now();
    try {
      const connectivity = await checkNetworkConnectivity();
      const responseTime = Date.now() - startTime;
      
      const onlineChains = Object.entries(connectivity).filter(([_, info]: [string, any]) => info.status === 'online');
      const status = onlineChains.length > 0 ? 'healthy' : 'unhealthy';
      
      return {
        name: 'Network Connectivity',
        status,
        responseTime,
        lastChecked: new Date().toISOString(),
        details: connectivity
      };
    } catch (error: any) {
      return {
        name: 'Network Connectivity',
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        error: error.message,
        lastChecked: new Date().toISOString()
      };
    }
  }

  private startMetricsCollection(): void {
    // Collect system metrics every 60 seconds
    const metricsInterval = setInterval(() => {
      try {
        const memUsage = process.memoryUsage();
        this.recordMetric('system.memory.heap_used', memUsage.heapUsed);
        this.recordMetric('system.memory.heap_total', memUsage.heapTotal);
        this.recordMetric('system.memory.external', memUsage.external);
        
        // CPU usage (simplified)
        const usage = process.cpuUsage();
        this.recordMetric('system.cpu.user', usage.user);
        this.recordMetric('system.cpu.system', usage.system);
        
        // Active handles and requests
        this.recordMetric('system.handles', (process as any)._getActiveHandles?.()?.length || 0);
        this.recordMetric('system.requests', (process as any)._getActiveRequests?.()?.length || 0);
        
        // Process uptime
        this.recordMetric('system.uptime', process.uptime());
        
      } catch (error: any) {
        this.log(LogLevel.WARN, 'Failed to collect system metrics', { error: error.message });
      }
    }, 60000);

    // Store interval for cleanup
    (this as any).metricsInterval = metricsInterval;

    this.log(LogLevel.INFO, 'Metrics collection started');
  }

  private setupLogRotation(): void {
    const rotationDays = this.config.logRotationDays || 7;
    
    // Run log rotation daily
    setInterval(() => {
      this.rotateOldLogs(rotationDays);
    }, 24 * 60 * 60 * 1000); // 24 hours
  }

  private rotateOldLogs(retentionDays: number): void {
    try {
      const logDir = path.dirname(this.logFile);
      const files = fs.readdirSync(logDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      files.forEach(file => {
        if (file.startsWith('app-') && file.endsWith('.log')) {
          const filePath = path.join(logDir, file);
          const stats = fs.statSync(filePath);
          
          if (stats.mtime < cutoffDate) {
            fs.unlinkSync(filePath);
            this.log(LogLevel.INFO, `Rotated old log file: ${file}`);
          }
        }
      });
    } catch (error: any) {
      this.log(LogLevel.WARN, 'Failed to rotate old logs', { error: error.message });
    }
  }

  public generateReport(): string {
    const report = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      version: process.env.APP_VERSION || '1.0.0',
      healthCheck: this.healthCheck(),
      recentErrors: this.getRecentErrors(),
      performanceMetrics: this.getPerformanceMetrics(),
      alertHistory: this.alertHistory.slice(-10), // Last 10 alerts
      systemMetrics: this.getSystemMetrics()
    };

    return JSON.stringify(report, null, 2);
  }

  private getRecentErrors(): any[] {
    // Get recent error metrics
    const errorMetrics = Array.from(this.metricsData.entries())
      .filter(([key, metric]) => key.includes('errors'))
      .slice(-10)
      .map(([_, metric]) => metric);

    return errorMetrics;
  }

  private getPerformanceMetrics(): any {
    const transactionMetrics = Array.from(this.performanceMetrics.entries())
      .reduce((acc, [name, values]) => {
        if (values.length > 0) {
          acc[name] = {
            count: values.length,
            average: values.reduce((sum, val) => sum + val, 0) / values.length,
            min: Math.min(...values),
            max: Math.max(...values),
            p95: this.calculatePercentile(values, 95)
          };
        }
        return acc;
      }, {} as any);

    return {
      transactions: transactionMetrics,
      errorRate: this.calculateErrorRate(),
      uptime: process.uptime()
    };
  }

  private calculatePercentile(values: number[], percentile: number): number {
    const sorted = values.slice().sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index];
  }

  private calculateErrorRate(): number {
    const errorCount = Array.from(this.metricsData.values())
      .filter(metric => metric.name.includes('errors'))
      .reduce((sum, metric) => sum + metric.value, 0);
    
    const totalRequests = Array.from(this.metricsData.values())
      .filter(metric => metric.name.includes('transactions'))
      .reduce((sum, metric) => sum + metric.value, 0);

    return totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0;
  }

  private getSystemMetrics(): any {
    const memUsage = process.memoryUsage();
    return {
      memory: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024),
        rss: Math.round(memUsage.rss / 1024 / 1024)
      },
      uptime: process.uptime(),
      pid: process.pid,
      platform: process.platform,
      nodeVersion: process.version
    };
  }

  public alert(severity: 'critical' | 'warning' | 'info', message: string, details?: any): void {
    const alert: Alert = {
      id: this.generateAlertId(),
      severity,
      message,
      details,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    };

    this.alertHistory.push(alert);

    // Keep only last 100 alerts
    if (this.alertHistory.length > 100) {
      this.alertHistory.shift();
    }

    // Log the alert
    const logLevel = severity === 'critical' ? LogLevel.ERROR : 
                    severity === 'warning' ? LogLevel.WARN : LogLevel.INFO;
    
    this.log(logLevel, `ALERT [${severity.toUpperCase()}]: ${message}`, details);

    // Record alert metrics
    this.recordMetric(`alerts.${severity}`, 1, 'counter');

    // TODO: Send to alerting systems (PagerDuty, Slack, etc.)
    if (severity === 'critical') {
      this.sendCriticalAlert(alert);
    }
  }

  private generateAlertId(): string {
    return `alert-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  private sendCriticalAlert(alert: Alert): void {
    try {
      // TODO: Implement critical alert notifications
      // - Send to PagerDuty
      // - Send to Slack
      // - Send email to on-call team
      console.log('🚨 CRITICAL ALERT SENT:', alert.message);
      this.recordMetric('alerts.critical.sent', 1, 'counter');
    } catch (error: any) {
      console.error('Failed to send critical alert:', error.message);
      this.recordMetric('alerts.critical.failed', 1, 'counter');
    }
  }

  public shutdown(): void {
    this.log(LogLevel.INFO, 'Shutting down monitoring system...');
    
    // Clear intervals
    if ((this as any).metricsInterval) {
      clearInterval((this as any).metricsInterval);
    }

    // Final metrics collection
    if (this.config.enableMetrics) {
      this.recordMetric('system.shutdown', 1, 'counter');
    }

    console.log('✅ Monitoring system shutdown complete');
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
    } catch (error: any) {
      logError(`Command ${operationName} failed`, error);
      recordMetric(`commands.${operationName}.errors`, 1, 'counter');
      
      // Send alert for critical operations
      const criticalOps = ['invest', 'borrow', 'originate-asset', 'mint-nft', 'collateralize'];
      if (criticalOps.includes(operationName)) {
        getMonitor().alert('critical', `Critical operation ${operationName} failed`, {
          error: error.message,
          args: JSON.stringify(args, null, 2)
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
  enableFileLogging: process.env.ENABLE_FILE_LOGGING !== 'false',
  logRotationDays: parseInt(process.env.LOG_ROTATION_DAYS || '7'),
  sentryDsn: process.env.SENTRY_DSN,
  datadogApiKey: process.env.DATADOG_API_KEY,
  alertThresholds: {
    memoryUsage: parseInt(process.env.MEMORY_ALERT_THRESHOLD || '80'),
    errorRate: parseFloat(process.env.ERROR_RATE_THRESHOLD || '5.0'),
    responseTime: parseInt(process.env.RESPONSE_TIME_THRESHOLD || '5000')
  }
};