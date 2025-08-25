import moment from 'moment-timezone';
import { Report } from '../models/ReportModel.js';
import logger from '../utils/logger.js';
import _ from 'lodash';

/**
 * Fix missing score and status fields in reports
 * This will use the save() method to trigger the pre-save hook
 * which will recalculate these fields via fetchScoresAndStatuses
 */
export const fixReportScoreAndStatus = async () => {
  try {
    logger.info('Starting to fix Report score and status fields...');

    // Get reports after February 2nd of this year
    const cutoffDate = moment().subtract(1, 'month').unix();
    logger.info(
      `Looking for reports with startTime >= ${cutoffDate} (${moment
        .unix(cutoffDate)
        .format('YYYY-MM-DD')})`,
    );

    // Find all reports that need fixing
    const reports = await Report.find({
      startTime: { $gte: cutoffDate },
      archived: { $ne: true },
    });

    logger.info(`Found ${reports.length} reports to process`);

    // Track our progress
    let updatedCount = 0;
    let errorCount = 0;

    // Process in batches to avoid memory issues
    const batchSize = 50;
    const batches = _.chunk(reports, batchSize);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      logger.info(
        `Processing batch ${i + 1}/${batches.length} (${batch.length} reports)`,
      );

      for (const report of batch) {
        try {
          // Save original values for logging
          const originalScore = report.score;
          const originalStatus = report.status;

          // Call save() to trigger the pre-save hook that will recalculate score and status
          await report.save();

          // Log changes
          if (
            report.score !== originalScore ||
            report.status !== originalStatus
          ) {
            logger.info(
              `Updated report ${report._id}: Score: "${originalScore}" → "${report.score}", Status: "${originalStatus}" → "${report.status}"`,
            );
            updatedCount++;
          }
        } catch (error) {
          logger.error(`Error updating report ${report._id}: ${error.message}`);
          errorCount++;
        }
      }

      logger.info(
        `Completed batch ${i + 1}/${
          batches.length
        }. Updated so far: ${updatedCount}, Errors: ${errorCount}`,
      );
    }

    logger.info(
      `Finished updating reports. Total updated: ${updatedCount}, Errors: ${errorCount}`,
    );
    return { updated: updatedCount, errors: errorCount };
  } catch (error) {
    logger.error('Error fixing report scores and statuses:', error);
    throw error;
  }
};
