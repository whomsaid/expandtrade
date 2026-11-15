import dotenv from 'dotenv';

dotenv.config();

export const env = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  jwtSecret: process.env.JWT_SECRET || 'bizflow_africa_dev_jwt_secret_change_in_prod_2026',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  dbClient: process.env.DB_CLIENT || (process.env.MYSQL_HOST ? 'mysql' : 'sqlite'),
  mysql: {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'bizflow_africa',
  },
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'noreply@bizflow.africa',
  },
  superAdmin: {
    name: process.env.SUPER_ADMIN_NAME || 'Jean Claude Ndayisaba',
    email: process.env.SUPER_ADMIN_EMAIL || '',
    phone: process.env.SUPER_ADMIN_PHONE || '+250788000001',
    password: process.env.SUPER_ADMIN_PASSWORD || '',
  },
};
