import { XAPIComponent } from '../XAPIComponent.js';

export class VerbComponent extends XAPIComponent {
  constructor(config = {}) {
    super(config);
    this.config = {
      verbId: config.verbId || 'http://adlnet.gov/expapi/verbs/completed',
      verbDisplay: config.verbDisplay || 'completed',
      ...config,
    };
  }

  build(data) {
    if (!data) {
      throw new Error('Data object is required');
    }

    const verbMap = {
      completed: {
        id: 'http://adlnet.gov/expapi/verbs/completed',
        display: { 'en-US': 'completed' },
      },
      attempted: {
        id: 'http://adlnet.gov/expapi/verbs/attempted',
        display: { 'en-US': 'attempted' },
      },
      answered: {
        id: 'http://adlnet.gov/expapi/verbs/answered',
        display: { 'en-US': 'answered' },
      },
      passed: {
        id: 'http://adlnet.gov/expapi/verbs/passed',
        display: { 'en-US': 'passed' },
      },
      failed: {
        id: 'http://adlnet.gov/expapi/verbs/failed',
        display: { 'en-US': 'failed' },
      },
      started: {
        id: 'http://adlnet.gov/expapi/verbs/started',
        display: { 'en-US': 'started' },
      },
    };

    let type = data?.trainingType ? 'training' : 'evaluation';

    if (type === 'training') {
      return data?.status === 'ongoing' ? verbMap.started : verbMap.completed;
    }

    const getStatusVerb = (status) =>
      status === 'pass' ? verbMap.passed : verbMap.failed;

    if (
      data?.mode &&
      ['mcq', 'time', 'questionAction', 'jsonLifeCycle'].includes(data.mode)
    ) {
      return data?.status ? getStatusVerb(data.status) : verbMap.attempted;
    }

    return verbMap.attempted; // default fallback
  }
}
