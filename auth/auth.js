import { createHash } from "crypto"
import jwt from 'jsonwebtoken';
const { verify, sign } = jwt;

// Retrieve the secret key for JWT from environment variables
const key = process.env.JWT_SECRET_KEY;

/**
 * Generates a JWT token for a given user.
 * 
 * @param {Object} user - The user data to encode in the token payload.
 * @returns {string} - The generated JWT token.
 */
export function generateToken(user) {
  return sign(user, key, { expiresIn: '3h' });
}

/**
 * Hashes a password using MD5.
 * 
 * @param {string} password - The plaintext password to hash.
 * @returns {string} - The hashed password.
 */
export function hashPassword(password) {
  // Use MD5 hashing to create a password hash
  return createHash('md5').update(password).digest('hex');
}

/**
 * Authenticates a request by verifying the JWT in the Authorization header.
 * 
 * @param {Object} req - The HTTP request object containing headers.
 * @returns {Object|undefined} - Decoded user data if token is valid; otherwise, undefined.
 */
export function authenticate(req) {
  // Extract token from the Authorization header in the format "Bearer <token>"
  const token = req.headers.authorization?.split(' ')[1];

  try {
    return verify(token, key);
  } catch (err) {
    return undefined; // Invalid or missing token
  }
}
