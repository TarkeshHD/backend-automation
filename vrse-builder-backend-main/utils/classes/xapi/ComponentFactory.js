import { ActorComponent } from './components/ActorComponent.js';
import { VerbComponent } from './components/VerbComponent.js';
import { ObjectComponent } from './components/ObjectComponent.js';
import { ResultComponent } from './components/ResultComponent.js';

export class ComponentFactory {
  static createComponent(type, config = {}) {
    switch (type) {
      case 'actor':
        return new ActorComponent(config);
      case 'verb':
        return new VerbComponent(config);
      case 'object':
        return new ObjectComponent(config);
      case 'result':
        return new ResultComponent(config);
      default:
        throw new Error(`Unknown component type: ${type}`);
    }
  }
}
