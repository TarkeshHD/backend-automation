import { Training } from '../models/TrainingModel.js';

// Migration script to update JsonLifeCycleTraining documents
export const updateTrainingSchema = async () => {
  const trainings = await Training.find({
    trainingType: 'jsonLifeCycle',
    'trainingDumpJson.chapters.moments.answers': { $exists: true },
  });

  console.log(`Found ${trainings.length} trainings to update`);

  for (const training of trainings) {
    try {
      // Process each training document
      const jsonLifeCycle = training.trainingDumpJson;

      if (!jsonLifeCycle || !jsonLifeCycle.chapters) {
        continue;
      }

      // Process each chapter and moment
      for (const chapter of jsonLifeCycle.chapters) {
        if (!chapter.moments) continue;

        for (const moment of chapter.moments) {
          if (!moment.answers || !moment.answers.events) continue;

          // Move the events from moment.answers to training.answers.jsonLifeCycleBased
          const events = moment.answers.events;

          if (events && events.length > 0) {
            // Add to the answers collection with proper format
            training.answers.jsonLifeCycleBased.push({
              chapterIndex: chapter.chapterIndex,
              momentIndex: moment.momentIndex,
              startTime: moment.startTime || 0,
              endTime: moment.endTime || 0,
              events: events,
            });

            // Remove the answers field from the moment
            delete moment.answers;
          }
        }
      }

      // Save the updated document
      await training.save();
      console.log(`Updated training: ${training._id}`);
    } catch (error) {
      console.error(`Error updating training ${training._id}:`, error);
    }
  }

  console.log('Migration completed');
};
