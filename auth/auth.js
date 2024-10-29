import { createHash } from "crypto"
import jwt from 'jsonwebtoken';
const { verify, sign } = jwt;

const key = process.env.JWT_SECRET_KEY;

export function generateToken(user) {
  return sign(user, key, { expiresIn: "3h" });
}

export function hashPassword(password) {
  return createHash('md5').update(password).digest('hex')
}

export function authenticate(req) {
  const token = req.headers.authorization?.split(" ")[1];
  try {
    return verify(token, key);
  } catch (err) {
    return undefined;
  }
}
