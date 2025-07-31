import mongoose from 'mongoose';
import { ModuleAccess } from '../models/ModuleAccessModel.js';

/**
 * Validates ModuleAccess documents to find instances where domains is not an array
 * or contains incorrect values
 *
 * @returns {Object} Validation results with details of problematic documents
 */
export const validateModuleAccessDomains = async () => {
  console.log('Starting ModuleAccess domains validation...');

  const validationResults = {
    total: 0,
    errors: [],
    fixedCount: 0,
  };

  // Get all documents from ModuleAccess collection
  const documents = await ModuleAccess.find({}).lean();
  validationResults.total = documents.length;

  // Check each document for domains field issues
  for (const doc of documents) {
    // Check if domains is not an array or is undefined
    if (!doc.domains || !Array.isArray(doc.domains)) {
      validationResults.errors.push({
        _id: doc._id,
        issue: 'domains field is not an array',
        value: doc.domains,
        type: typeof doc.domains,
      });
    }
    // Check if domains contains any non-ObjectId values
    else if (
      doc.domains.some(
        (id) =>
          !(id instanceof mongoose.Types.ObjectId) &&
          !mongoose.Types.ObjectId.isValid(id),
      )
    ) {
      validationResults.errors.push({
        _id: doc._id,
        issue: 'domains contains invalid ObjectId values',
        value: doc.domains,
      });
    }
  }

  console.log(
    `✓ ModuleAccess: ${validationResults.errors.length} documents with domain field errors out of ${documents.length}`,
  );

  return validationResults;
};

/**
 * Fixes ModuleAccess documents where domains is not an array
 *
 * @param {boolean} dryRun - If true, only reports issues without fixing
 * @returns {Object} Results of the fix operation
 */
export const fixModuleAccessDomains = async (dryRun = true) => {
  console.log(
    `${dryRun ? 'Checking' : 'Fixing'} ModuleAccess domains issues...`,
  );

  const results = {
    checkedCount: 0,
    fixedCount: 0,
    issues: [],
  };

  // Find all documents where domains is not an array
  const documentsToFix = await ModuleAccess.find({
    $where: 'this.domains && !Array.isArray(this.domains)',
  }).lean();

  results.checkedCount = documentsToFix.length;

  for (const doc of documentsToFix) {
    results.issues.push({
      _id: doc._id,
      currentValue: doc.domains,
    });

    if (!dryRun) {
      // Convert single value to array
      const domainValue = doc.domains;

      // Update the document to fix the domains field
      await ModuleAccess.updateOne(
        { _id: doc._id },
        { $set: { domains: [domainValue] } },
      );

      results.fixedCount++;
    }
  }

  console.log(
    `${dryRun ? 'Found' : 'Fixed'} ${
      results.issues.length
    } documents with domains field issues`,
  );

  return results;
};
