import winston from 'winston';
import chalk from 'chalk';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(info => {
      const timestamp = chalk.gray(`[${info.timestamp}]`);
      let message = info.message;
      
      // Colorear según el nivel
      if (info.message.startsWith('Thinking:')) {
        const startTime = info.timestamp;
        const duration = info.duration ? ` (${(info.duration / 1000).toFixed(2)}s)` : '';
        message = chalk.cyan(`[${startTime}] Thinking${duration}:\n${info.message.replace('Thinking:', '').trim()}`);
      } else {
        switch (info.level) {
          case 'error':
            message = chalk.red(message);
            break;
          case 'warn':
            message = chalk.yellow(message);
            break;
          case 'info':
            message = chalk.blue(message);
            break;
          case 'debug':
            message = chalk.green(message);
            break;
          default:
            message = chalk.white(message);
        }
      }
      
      return `${timestamp} ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    })
  ]
});

export default logger;
