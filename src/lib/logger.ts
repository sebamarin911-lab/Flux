// Robust System Logger for Flux PWA
type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

class Logger {
  private getTimestamp(): string {
    return new Date().toISOString();
  }

  private formatMessage(level: LogLevel, context: string, message: string): string {
    return `[${this.getTimestamp()}] [${level}] [${context}] ${message}`;
  }

  debug(context: string, message: string, ...args: any[]) {
    if (import.meta.env.DEV) {
      console.debug(this.formatMessage('DEBUG', context, message), ...args);
    }
  }

  info(context: string, message: string, ...args: any[]) {
    console.info(this.formatMessage('INFO', context, message), ...args);
  }

  warn(context: string, message: string, ...args: any[]) {
    console.warn(this.formatMessage('WARN', context, message), ...args);
  }

  error(context: string, message: string, ...args: any[]) {
    console.error(this.formatMessage('ERROR', context, message), ...args);
    
    // Persist diagnostic logs to LocalStorage for offline/mobile debugging
    try {
      const persisted = localStorage.getItem('flux_system_errors');
      const errors = persisted ? JSON.parse(persisted) : [];
      errors.push({
        timestamp: this.getTimestamp(),
        context,
        message,
        details: args.map(a => {
          if (a instanceof Error) return { name: a.name, message: a.message, stack: a.stack };
          if (typeof a === 'object') {
            try { return JSON.stringify(a); } catch { return '[Unserializable Object]'; }
          }
          return String(a);
        })
      });
      // Cap at last 50 critical diagnostics
      if (errors.length > 50) errors.shift();
      localStorage.setItem('flux_system_errors', JSON.stringify(errors));
    } catch (e) {
      // Prevent crash on logging storage limit
    }
  }
}

export const logger = new Logger();
