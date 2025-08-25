import { XAPIComponent } from '../XAPIComponent.js';

export class ObjectComponent extends XAPIComponent {
  constructor(config = {}) {
    super(config);
    this.config = {
      baseUrl: config.baseUrl || 'http://example.com/activities',
      objectType: config.objectType || 'Activity',
      activityType:
        config.activityType || 'http://adlnet.gov/expapi/activities/assessment',
      ...config,
    };
  }

  build(data) {
    if (!data) {
      throw new Error('Data object is required');
    }

    const moduleName = data?.moduleId?.name || 'Unknown Module';
    const moduleDescription =
      data?.moduleId?.description || 'No description available';
    const moduleId = data?.moduleId?._id || 'unknown';
    const activityType = data?.trainingStatus
      ? 'http://adlnet.gov/expapi/activities/training'
      : 'http://adlnet.gov/expapi/activities/assessment';

    return {
      id: `${
        this.config?.baseUrl || 'http://example.com/activities'
      }/${moduleId}`,
      objectType: this.config?.objectType || 'Activity',
      definition: {
        name: {
          'en-US': moduleName,
        },
        description: {
          'en-US': moduleDescription,
        },
        type: activityType,
        interactionType: this.getInteractionType(data?.mode),
      },
    };
  }

  getInteractionType(mode) {
    if (!mode) return 'other';
    const types = {
      jsonLifeCycle: 'performance',
      mcq: 'choice',
      time: 'other',
      questionAction: 'choice',
    };
    return types[mode] || 'other';
  }
}
