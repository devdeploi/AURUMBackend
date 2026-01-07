import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const algorithm = 'aes-256-ctr';
// Ensure we have a key. In production, this MUST be in .env and 32 chars long.
// Fallback for dev only to prevent crash if not set, but strongly advise setting it.
const secretKey = process.env.ENCRYPTION_KEY || 'vOVH6sdmpNWjRRIqCc7rdxs01lwHzfr3';
const ivLength = 16;

export const encrypt = (text) => {
    if (!text) return text;
    const iv = crypto.randomBytes(ivLength);
    const cipher = crypto.createCipheriv(algorithm, Buffer.from(secretKey), iv);
    const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);

    return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
};

export const decrypt = (hash) => {
    if (!hash) return hash;
    const [ivPart, encryptedPart] = hash.split(':');
    if (!ivPart || !encryptedPart) return hash; // Return as is if not in format

    const iv = Buffer.from(ivPart, 'hex');
    const encryptedText = Buffer.from(encryptedPart, 'hex');
    const decipher = crypto.createDecipheriv(algorithm, Buffer.from(secretKey), iv);
    const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);

    return decrypted.toString();
};
