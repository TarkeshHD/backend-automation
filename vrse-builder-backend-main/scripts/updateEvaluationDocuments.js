import _ from 'lodash';

import { Report } from '../models/ReportModel.js';
import logger from '../utils/logger.js';

export const updateEvaluationDocuments = async () => {
  try {
    const reports = await Report.find({});

    for (const report of reports) {
      // pre save middleware will update the evaluation documents
      await report.save();
    }
  } catch (error) {
    logger.error(`Error updating reports:`, error);
  }
};
