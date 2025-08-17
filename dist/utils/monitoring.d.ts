export declare enum LogLevel {
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
declare class ProductionMonitor {
    private config;
    private metricsData;
    private logFile;
    constructor(config: MonitoringConfig);
    private ensureLogDirectory;
    private initializeMonitoring;
    log(level: LogLevel, message: string, metadata?: any): void;
    private reportError;
    recordMetric(name: string, value: number, type?: 'counter' | 'gauge' | 'histogram'): void;
    recordTransaction(type: string, duration: number, success: boolean): void;
    recordUserActivity(action: string, userId?: string): void;
    healthCheck(): {
        status: string;
        checks: any[];
    };
    private checkDatabase;
    private checkCentrifugeAPI;
    private checkBlockchainRPC;
    private checkFileSystem;
    private checkMemoryUsage;
    private startMetricsCollection;
    generateReport(): string;
    private getRecentErrors;
    private getPerformanceMetrics;
    alert(severity: 'critical' | 'warning' | 'info', message: string, details?: any): void;
    private sendCriticalAlert;
}
export declare function initializeMonitoring(config: MonitoringConfig): ProductionMonitor;
export declare function getMonitor(): ProductionMonitor;
export declare function log(level: LogLevel, message: string, metadata?: any): void;
export declare function logError(message: string, error?: any): void;
export declare function logInfo(message: string, metadata?: any): void;
export declare function recordMetric(name: string, value: number, type?: 'counter' | 'gauge' | 'histogram'): void;
export declare function recordTransaction(type: string, duration: number, success: boolean): void;
export declare function recordUserActivity(action: string, userId?: string): void;
export declare function monitorPerformance(operationName: string): (target: any, propertyName: string, descriptor: PropertyDescriptor) => void;
export declare function withErrorHandling<T extends any[], R>(fn: (...args: T) => Promise<R>, operationName: string): (...args: T) => Promise<R | void>;
export declare function setupHealthEndpoint(): void;
export declare const defaultMonitoringConfig: MonitoringConfig;
export {};
