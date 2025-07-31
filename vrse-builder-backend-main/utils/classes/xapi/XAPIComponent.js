export class XAPIComponent {
  constructor(config = {}) {
    this.config = config;
  }

  build() {
    throw new Error('Build method must be implemented');
  }
}
