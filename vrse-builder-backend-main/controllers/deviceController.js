import moment from 'moment-timezone';
import { CONF, HttpStatusCode } from '../constants.js';
import { Device } from '../models/DeviceModel.js';
import _ from 'lodash';
import { Log } from '../models/LogsModel.js';
import { otpUtils } from '../utils/classes/OTP.js';
import logger from '../utils/logger.js';
import {
  getAllUsersInDomain,
  getAllUsersInDomainDepartments,
  createFilterQuery,
} from '../utils/helpers.js';

const DEVICE_LOGIN_LIMIT = CONF.deviceLoginLimit;
function findIndex(values, valueToFInd) {
  return values.findIndex((value) => {
    return value.id.toString() === valueToFInd.toString();
  });
}

export const registerDevice = async (deviceId, macAddr) => {
  // find the count of how many devices registered in db
  const deviceCount = await Device.countDocuments().exec();
  if (deviceCount >= DEVICE_LOGIN_LIMIT) {
    throw new Error('Device limit reached');
  }

  const device = new Device({
    deviceId: deviceId,
    macAddr: macAddr,
  });
  await device.save();
  return device;
};

const isDeviceRegistered = async (deviceId) => {
  const device = await Device.findOne({ deviceId: deviceId }).exec();
  if (!device) {
    return false;
  }
  return device;
};

export const addUserToDevice = async (deviceId, userId, ip, macAddr) => {
  let device = await isDeviceRegistered(deviceId);
  if (!device) {
    device = await registerDevice(deviceId, macAddr);
  }

  if (!device) {
    throw new Error('Device not found');
  }

  const currentTime = moment().unix();

  // users should be unique set, only if the user not there, add to the list
  const indexOfUser = findIndex(device.users, userId);
  if (indexOfUser === -1) {
    device.users.push({ id: userId, time: [currentTime] });
  } else {
    device.users[indexOfUser].time.push(currentTime);
  }

  device.ipAddress.push({ ip: ip, time: currentTime });
  await device.save();
  return device;
};

export const addDomainToDevice = async (deviceId, domainId, ip, macAddr) => {
  let device = await isDeviceRegistered(deviceId);

  if (!device) {
    device = await registerDevice(deviceId, macAddr);
  }

  if (!device) {
    throw new Error('Device not found');
  }

  const currentTime = moment().unix();
  // domains should be unique set, only if the domain not there, add to the list
  const indexOfUser = findIndex(device.domains, domainId);
  if (indexOfUser === -1) {
    device.domains.push({ id: domainId, time: [currentTime] });
  } else {
    device.domains[indexOfUser].time.push(currentTime);
  }

  device.ipAddress.push({ ip: ip, time: currentTime });
  await device.save();
  return device;
};

export const getAllDevices = async (req, res) => {
  let { page, limit, sort, filters = {} } = req.query;

  let domains, users;
  const user = req.user;
  if (user.role === 'admin') {
    ({ domains, users } = await getAllUsersInDomainDepartments(req));
  } else {
    ({ domains, users } = await getAllUsersInDomain());
  }

  const parsedFilters = createFilterQuery(filters);

  const match = {
    $or: [{ 'domains.id': { $in: domains } }, { 'users.id': { $in: users } }],
  };

  if (!_.isEmpty(parsedFilters)) {
    _.merge(match, parsedFilters);
  }

  const aggregate = Device.aggregate([
    // Unwind both domains and users
    { $unwind: { path: '$domains', preserveNullAndEmptyArrays: true } },
    { $unwind: { path: '$users', preserveNullAndEmptyArrays: true } },
    // Match both domains and users
    {
      $match: match,
    },
    // Group results
    {
      $group: {
        _id: '$_id',
        deviceId: { $first: '$deviceId' },
        uniqueDomainCount: { $addToSet: '$domains.id' },
        uniqueUserCount: { $addToSet: '$users.id' },
        createdAt: { $first: '$createdAt' },
        updatedAt: { $first: '$updatedAt' },
        ipAddress: { $first: '$ipAddress' },
        macAddr: { $first: '$macAddr' },
        domains: { $push: '$domains' },
        users: { $push: '$users' },
      },
    },
    {
      $lookup: {
        from: 'domains',
        localField: 'domains.id',
        foreignField: '_id',
        as: 'domainDetails',
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'users.id',
        foreignField: '_id',
        as: 'userDetails',
      },
    },
    {
      $addFields: {
        domains: {
          $map: {
            input: '$domains',
            as: 'domain',
            in: {
              id: '$$domain.id',
              time: '$$domain.time',
              name: {
                $arrayElemAt: [
                  {
                    $filter: {
                      input: '$domainDetails',
                      as: 'detail',
                      cond: { $eq: ['$$detail._id', '$$domain.id'] },
                    },
                  },
                  0,
                ],
              },
            },
          },
        },
        users: {
          $map: {
            input: '$users',
            as: 'user',
            in: {
              id: '$$user.id',
              time: '$$user.time',
              name: {
                $arrayElemAt: [
                  {
                    $filter: {
                      input: '$userDetails',
                      as: 'detail',
                      cond: { $eq: ['$$detail._id', '$$user.id'] },
                    },
                  },
                  0,
                ],
              },
            },
          },
        },
      },
    },
    {
      $project: {
        deviceId: 1,
        uniqueDomainCount: { $size: '$uniqueDomainCount' },
        uniqueUserCount: { $size: '$uniqueUserCount' },
        updatedAt: 1,
        ipAddress: 1,
        macAddr: 1,
        domains: {
          id: 1,
          time: 1,
          'name.name': 1,
        },
        users: {
          id: 1,
          time: 1,
          'name.name': 1,
        },
      },
    },
  ]);

  sort = sort ? JSON.parse(sort) : { createdAt: -1 };

  const deviceResults = await Device.aggregatePaginate(aggregate, {
    page,
    limit,
    sort,
    pagination: !page ? false : true,
  });

  const mergedResults = deviceResults?.docs?.map((device) => {
    const uniqueDomainsHistory = new Map();

    device.domains
      .filter((domain) => domain.id && domain.time)
      .forEach((domain) => {
        domain.time.forEach((time) => {
          const key = `${domain.id}_${time}`;

          // Only add if this specific combination doesn't exist or is newer
          if (!uniqueDomainsHistory.has(key)) {
            uniqueDomainsHistory.set(key, {
              id: domain.id,
              name: domain.name.name,
              time,
            });
          }
        });
      });

    // Convert Map to sorted array
    const domainsHistory = Array.from(uniqueDomainsHistory.values()).sort(
      (a, b) => b.time - a.time,
    );

    // Similar unique processing for users
    const uniqueUsersHistory = new Map();

    const usersHistory = device.users
      .filter((user) => user.id && user.time)
      .flatMap((user) =>
        user.time.map((time) => ({
          id: user.id,
          name: user?.name?.name,
          time,
        })),
      )
      .filter((userEntry) => {
        const key = `${userEntry.id}_${userEntry.time}`;

        if (!uniqueUsersHistory.has(key)) {
          uniqueUsersHistory.set(key, userEntry);
          return true;
        }
        return false;
      })
      .sort((a, b) => b.time - a.time);

    return {
      _id: device._id,
      deviceId: device.deviceId,
      uniqueUserCount: device.uniqueUserCount,
      uniqueDomainCount: device.uniqueDomainCount,
      updatedAt: device.updatedAt,
      ipAddress: device.ipAddress,
      macAddr: device.macAddr,
      domainsHistory,
      usersHistory,
    };
  });

  deviceResults.docs = mergedResults;

  return res.status(HttpStatusCode.OK).json({
    message: 'All devices',
    devices: deviceResults,
  });
};

export const getOneDevice = async (req, res) => {
  const { deviceId } = req.params;

  const user = req.user;
  let domains, users;
  if (user.role === 'admin') {
    ({ domains, users } = await getAllUsersInDomainDepartments(req));
  } else {
    ({ domains, users } = await getAllUsersInDomain());
  }

  const [domainResults, userResults] = await Promise.all([
    // Unwind domains and group to get unique domains
    Device.aggregate([
      { $match: { deviceId } },
      { $unwind: { path: '$domains', preserveNullAndEmptyArrays: true } },
      {
        $match: {
          'domains.id': { $in: domains },
        },
      },
      {
        $group: {
          _id: '$_id',
          deviceId: { $first: '$deviceId' },
          uniqueDomainCount: { $addToSet: '$domains.id' },
          createdAt: { $first: '$createdAt' },
          updatedAt: { $first: '$updatedAt' },
          ipAddress: { $first: '$ipAddress' },
          domains: { $push: '$domains' },
        },
      },
      {
        $project: {
          deviceId: 1,
          uniqueDomainCount: { $size: '$uniqueDomainCount' },
          createdAt: 1,
          updatedAt: 1,
          ipAddress: 1,
          domains: 1,
        },
      },
      {
        $lookup: {
          from: 'domains',
          localField: 'domains.id',
          foreignField: '_id',
          as: 'domainDetails',
        },
      },
      {
        $addFields: {
          domains: {
            $map: {
              input: '$domains',
              as: 'domain',
              in: {
                id: '$$domain.id',
                time: '$$domain.time',
                name: {
                  $arrayElemAt: [
                    {
                      $filter: {
                        input: '$domainDetails',
                        as: 'detail',
                        cond: { $eq: ['$$detail._id', '$$domain.id'] },
                      },
                    },
                    0,
                  ],
                },
              },
            },
          },
        },
      },
      {
        $project: {
          deviceId: 1,
          uniqueDomainCount: 1,
          updatedAt: 1,
          ipAddress: 1,
          domains: {
            id: 1,
            time: 1,
            'name.name': 1,
          },
        },
      },
    ]),
    // Unwind users and group to get unique users
    Device.aggregate([
      { $match: { deviceId } },
      { $unwind: { path: '$users', preserveNullAndEmptyArrays: true } },
      {
        $match: {
          'users.id': { $in: users },
        },
      },
      {
        $group: {
          _id: '$_id',
          deviceId: { $first: '$deviceId' },
          uniqueUserCount: { $addToSet: '$users.id' },
          createdAt: { $first: '$createdAt' },
          updatedAt: { $first: '$updatedAt' },
          ipAddress: { $first: '$ipAddress' },
          users: { $push: '$users' },
        },
      },
      {
        $project: {
          deviceId: 1,
          uniqueUserCount: { $size: '$uniqueUserCount' },
          createdAt: 1,
          updatedAt: 1,
          ipAddress: 1,
          users: 1,
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'users.id',
          foreignField: '_id',
          as: 'userDetails',
        },
      },
      {
        $addFields: {
          users: {
            $map: {
              input: '$users',
              as: 'user',
              in: {
                id: '$$user.id',
                time: '$$user.time',
                name: {
                  $arrayElemAt: [
                    {
                      $filter: {
                        input: '$userDetails',
                        as: 'detail',
                        cond: { $eq: ['$$detail._id', '$$user.id'] },
                      },
                    },
                    0,
                  ],
                },
              },
            },
          },
        },
      },
      {
        $project: {
          deviceId: 1,
          uniqueUserCount: 1,
          updatedAt: 1,
          ipAddress: 1,
          users: {
            id: 1,
            time: 1,
            'name.name': 1,
          },
        },
      },
    ]),
  ]);

  // Merge results
  const mergedResults = domainResults.map((domainDevice) => {
    const userDevice = userResults.find(
      (userDevice) => userDevice._id.toString() === domainDevice._id.toString(),
    );

    const domainsHistory = domainDevice.domains
      .filter((domain) => domain.id && domain.time)
      .map((domain) =>
        domain.time.map((time) => ({
          id: domain.id,
          name: domain.name.name,
          time,
        })),
      )
      .flat()
      .sort((a, b) => b.time - a.time);

    const usersHistory = (userDevice?.users || [])
      .filter((user) => user.id && user.time)
      .map((user) =>
        user.time.map((time) => ({ id: user.id, name: user.name.name, time })),
      )
      .flat()
      .sort((a, b) => b.time - a.time);

    return {
      _id: domainDevice._id,
      deviceId: domainDevice.deviceId,
      uniqueUserCount: userDevice?.uniqueUserCount || 0,
      uniqueDomainCount: domainDevice.uniqueDomainCount,
      updatedAt: domainDevice.updatedAt,
      ipAddress: domainDevice.ipAddress,
      domainsHistory,
      usersHistory,
    };
  });
  return res.status(HttpStatusCode.OK).json({
    message: 'Device Found',
    details: {
      mergedResults,
    },
  });
};
