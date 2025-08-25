import { Project } from '../models/ProjectModel.js';
import moment from 'moment';
import BaseError from '../utils/classes/BaseError.js';
import { HttpStatusCode } from '../constants.js';

export const createOrUpdateProject = async (req, res) => {
  const { projectId } = req.params;
  const updateData = { ...req.body };
  const { isDeleted = false } = req.body;

  const existingProject = await Project.findById(projectId);

  if (!existingProject) {
    // Creation Flow
    if (!updateData.name || !updateData.description) {
      throw new BaseError(
        'ServerError',
        HttpStatusCode.BAD_REQUEST,
        'Name and Description value is missing',
      );
    }

    const duplicateProject = await Project.findOne({
      name: updateData.name,
      archived: { $ne: true },
    }).lean();

    if (duplicateProject) {
      throw new BaseError(
        'ServerError',
        HttpStatusCode.BAD_REQUEST,
        'The Project with same name already exist',
      );
    }

    const newProject = new Project({
      _id: projectId,
      ...updateData,
      creator: req.user?._id,
    });

    await newProject.save();

    return res.status(HttpStatusCode.OK).json({
      success: true,
      message: 'New project created successfully',
      details: newProject,
    });
  } else {
    // Update Flow
    delete updateData._id;

    if (updateData.name) {
      const duplicateProject = await Project.findOne({
        name: updateData.name,
        _id: { $ne: projectId },
        archived: { $ne: true },
      }).lean();

      if (duplicateProject) {
        throw new BaseError(
          'ServerError',
          HttpStatusCode.BAD_REQUEST,
          'The Project with same name already exist',
        );
      }
    }

    if (isDeleted) {
      const archivedProject = await Project.findByIdAndUpdate(
        projectId,
        {
          archived: true,
          archivedAt: moment().toDate(),
        },
        { new: true },
      );

      return res.status(HttpStatusCode.OK).json({
        success: true,
        message: 'Project archived successfully',
        details: archivedProject,
      });
    }

    const updatedProject = await Project.findByIdAndUpdate(
      projectId,
      { $set: updateData },
      { new: true, runValidators: true },
    );

    return res.status(HttpStatusCode.OK).json({
      success: true,
      message: 'Project updated successfully',
      details: updatedProject,
    });
  }
};
