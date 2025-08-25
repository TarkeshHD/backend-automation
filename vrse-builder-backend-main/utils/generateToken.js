import jsonWebToken from 'jsonwebtoken';
import { JWT_KEY, JWT_KEY_FOR_INVITE } from '../constants.js';

export const generateToken = (signature) => {
  return jsonWebToken.sign(signature, JWT_KEY, { expiresIn: '10d' });
};

export const generateTokenForTFA = (signature) => {
  return jsonWebToken.sign(signature, JWT_KEY, { expiresIn: '10d' });
};

export const generateTokenForInvite = (signature) => {
  return jsonWebToken.sign(signature, JWT_KEY_FOR_INVITE, { expiresIn: '6d' });
};

export const decodeInviteToken = async (token) => {
  try {
    // Verify the token with the secret and decode it
    const decoded = jsonWebToken.verify(token, JWT_KEY_FOR_INVITE);
    // If the token is valid, the decoded payload is returned
    return decoded;
  } catch (error) {
    throw new Error(
      'Token verification failed / Invalid invite link',
      error.message,
    );
  }
};
