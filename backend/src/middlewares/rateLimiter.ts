import rateLimit from 'express-rate-limit';

export const orderCreationLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Limit each IP to 10 order requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'คุณทำรายการสั่งจองถี่เกินไป กรุณารอสักครู่แล้วลองใหม่อีกครั้ง',
  },
});
