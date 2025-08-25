import fs from 'fs';
import path from 'path';
import { HttpStatusCode } from '../constants.js';
import BaseError from '../utils/classes/BaseError.js';

const mimetypes = {
  '.glb': 'model/gltf-binary',
  '.webp': 'image/jpeg',
  '.png': 'image/png',
  '.jpeg': 'image/jpeg',
  '.mpeg': 'audio/mpeg',
  '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/vnd.wav',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.svg': 'image/svg+xml',
};

export const getFile = async (req, res, next) => {
  const nestedFilePath = req.params[0];
  const baseDir = 'uploads';
  const fileDir = decodeURIComponent(nestedFilePath);
  const ext = path.extname(fileDir); // extension

  if (!fs.existsSync(path.join('.', baseDir, fileDir))) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'File not found.',
    );
  }
  const file = fs.readFileSync(path.join('.', baseDir, fileDir));

  return res.send(file);
};
