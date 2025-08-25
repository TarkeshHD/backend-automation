import { Module } from '../models/ModuleModel.js';

export const fixModuleFailureMoments = async () => {
  try {
    const modules = await Module.find({});
    let updatedCount = 0;

    for (const module of modules) {
      let hasChanges = false;

      if (module.momentCount && Array.isArray(module.momentCount)) {
        module.momentCount = module.momentCount.map((moment) => {
          if (moment.users && Array.isArray(moment.users)) {
            const filteredUsers = moment.users.filter((user) => {
              if (user.count === 0) {
                hasChanges = true;
                return false;
              }
              return true;
            });

            moment.users = filteredUsers;
          }
          return moment;
        });

        module.momentCount = module.momentCount.map((moment) => {
          if (moment.users && Array.isArray(moment.users)) {
            const filteredUsers = moment.users.filter((user) => {
              if (typeof user.id === 'string') {
                const isFullUserObject =
                  user.id.includes('username') && user.id.includes('role');
                if (isFullUserObject) {
                  hasChanges = true;
                  return false; // Remove this user entry
                }
              }
              return true; // Keep this user entry
            });

            moment.users = filteredUsers;
          }
          return moment;
        });
      }

      if (hasChanges) {
        await module.save();
        updatedCount++;
        console.log(`Updated module ${module._id}`);
      }
    }

    console.log(`Completed: Cleaned up ${updatedCount} modules`);
    return { success: true, updatedCount };
  } catch (error) {
    console.error('Error fixing module failure moments:', error);
    throw error;
  }
};
