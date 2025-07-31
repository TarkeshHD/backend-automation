import mongoose from 'mongoose';
import _ from 'lodash';
import mongoosePaginate from 'mongoose-paginate-v2';

const Model = mongoose.Schema(
  {
    name: { type: String, index: true },
    domainId: { type: mongoose.Schema.Types.ObjectId, ref: 'domain' },
    archived: {
      type: Boolean,
      default: false,
    },
    archivedAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

Model.statics.createDepartment = async function (data) {
  // Check if department with same name exists in the same domain
  let isAvailable = await this.findOne({
    name: data.name,
    domainId: data.domainId,
    archived: { $ne: true },
  });

  if (!_.isEmpty(isAvailable)) {
    throw new Error('Department with same name already exists in this domain');
  }

  return await this.create(data);
};

Model.plugin(mongoosePaginate);

export const Department = mongoose.model('department', Model);
