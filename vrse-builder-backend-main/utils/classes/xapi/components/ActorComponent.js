import { XAPIComponent } from '../XAPIComponent.js';

export class ActorComponent extends XAPIComponent {
  constructor(config = {}) {
    super(config);
    this.config = {
      homePage: config.homePage || 'http://example.com',
      objectType: config.objectType || 'Agent',
      ...config,
    };
  }

  build(data) {
    if (!data) {
      throw new Error('Data object is required');
    }

    const userName = data?.userId?.name?.toString() || 'Unknown User';
    const homePage = this.config?.homePage || 'http://example.com';

    return {
      objectType: this.config?.objectType || 'Agent',
      name: userName,
      account: {
        homePage: homePage,
        name: userName,
      },
    };
  }
}
