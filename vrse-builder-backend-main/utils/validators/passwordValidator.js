import { Log } from '../../models/LogsModel.js';

export const isPasswordExpired = async (userId) => {
  const logs = await Log.find({
    level: 'record',
    'meta.action': 'update',
    'meta.type': 'password_reset',
    'meta.userId': userId.toString(),
  });

  logs.sort(function (x, y) {
    return y.timestamp - x.timestamp;
  });
  if (logs.length === 0) return true;

  const lastPasswordReset = logs[0]._doc.timestamp;
  const timeElapsed = Date.now() - new Date(lastPasswordReset).getTime();

  if (new Date(timeElapsed).getMonth()) return true;

  return false;
};
