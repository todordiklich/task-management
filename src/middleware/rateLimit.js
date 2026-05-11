import { rateLimit as expressRateLimit } from 'express-rate-limit';

// Rate limiting configuration
const createRateLimit = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    max = 100, // limit each IP to 100 requests per windowMs
    message = 'Too many requests from this IP, please try again later.',
    standardHeaders = true,
    legacyHeaders = false,
  } = options;

  return expressRateLimit({
    windowMs,
    max,
    message,
    standardHeaders,
    legacyHeaders,
    handler: (req, res) => {
      res.status(429).json({
        error: 'Rate limit exceeded',
        message,
        retryAfter: Math.ceil(windowMs / 1000), // seconds
      });
    },
  });
};

// Different rate limits for different endpoints
export const authRateLimit = createRateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 login attempts per 1 minute
  message: 'Too many authentication attempts, please try again later.',
});

export const generalRateLimit = createRateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per 1 minute
});

export default createRateLimit;
