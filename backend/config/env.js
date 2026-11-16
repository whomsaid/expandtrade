import dotenv from 'dotenv';

dotenv.config();

export const env = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  jwtSecret: process.env.JWT_SECRET || 'biztrade_africa_dev_jwt_secret_change_in_prod_2026',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  dbClient: process.env.DB_CLIENT || (process.env.MYSQL_HOST ? 'mysql' : 'sqlite'),
  mysql: {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'biztrade_africa',
  },
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'noreply@biztrade.africa',
  },
  superAdmin: {
    name: process.env.SUPER_ADMIN_NAME || 'Jean Claude Ndayisaba',
    email: process.env.SUPER_ADMIN_EMAIL || '',
    phone: process.env.SUPER_ADMIN_PHONE || '+250788000001',
    password: process.env.SUPER_ADMIN_PASSWORD || '',
  },
  mtnMomo: {
    baseUrl: (process.env.MTN_MOMO_BASE_URL || 'https://sandbox.momodeveloper.mtn.com').replace(/\/+$/, ''),
    targetEnv: process.env.MTN_MOMO_ENV || 'sandbox',
    subscriptionKey: process.env.MTN_MOMO_SUBSCRIPTION_KEY || '',
    apiUser: process.env.MTN_MOMO_API_USER || '',
    apiKey: process.env.MTN_MOMO_API_KEY || '',
    callbackUrl: process.env.MTN_MOMO_CALLBACK_URL || '',
    webhookSecret: process.env.MTN_MOMO_WEBHOOK_SECRET || '',
  },
  airtelMoney: {
    baseUrl: (process.env.AIRTEL_MONEY_BASE_URL || 'https://openapiuat.airtel.africa').replace(/\/+$/, ''),
    env: process.env.AIRTEL_MONEY_ENV || 'staging',
    clientId: process.env.AIRTEL_MONEY_CLIENT_ID || '',
    clientSecret: process.env.AIRTEL_MONEY_CLIENT_SECRET || '',
    country: process.env.AIRTEL_MONEY_COUNTRY || 'RW',
    currency: process.env.AIRTEL_MONEY_CURRENCY || 'RWF',
    callbackUrl: process.env.AIRTEL_MONEY_CALLBACK_URL || '',
    webhookSecret: process.env.AIRTEL_MONEY_WEBHOOK_SECRET || '',
  },
};

