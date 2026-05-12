import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { config } from '../config/index.js';

const REFRESH_TOKEN_BYTES = 32;

/**
 * Generate JWT access token
 * @param {Object} payload - Token payload (user info)
 * @returns {string} JWT access token
 */
export const generateAccessToken = (payload) => {
  return jwt.sign(
    {
      id: payload.id,
      email: payload.email,
      role: payload.role,
      type: 'access'
    },
    config.JWT_ACCESS_SECRET,
    { expiresIn: config.JWT_ACCESS_EXPIRES_IN }
  );
};

/**
 * Generate refresh token (random string)
 * @returns {string} Random refresh token
 */
export const generateRefreshToken = () => {
  return randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
};

/**
 * Get refresh token expiration date
 * @returns {Date} Expiration date for refresh token
 */
export const getRefreshTokenExpiry = () => {
  // Parse the refresh token expiry from config (e.g., "7d" = 7 days)
  const expiryDays = parseInt(config.JWT_REFRESH_EXPIRES_IN) || 7;
  return new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);
};

/**
 * Verify JWT access token
 * @param {string} token - JWT token to verify
 * @returns {Object} Decoded token payload
 * @throws {Error} If token is invalid
 */
export const verifyAccessToken = (token) => {
  try {
    const decoded = jwt.verify(token, config.JWT_ACCESS_SECRET);
    
    if (decoded.type !== 'access') {
      throw new Error('Invalid token type');
    }
    
    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Access token expired');
    } else if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid access token');
    } else {
      throw error;
    }
  }
};

