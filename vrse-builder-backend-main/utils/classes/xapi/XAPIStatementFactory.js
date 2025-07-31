import {
  JsonLifeCycleStrategy,
  McqStrategy,
  TimeBasedStrategy,
  QuestionActionStrategy,
  TrainingStrategy,
} from './Strategies.js';
import { ComponentFactory } from './ComponentFactory.js';

export class XAPIStatementFactory {
  constructor(config = {}) {
    this.components = {
      actor: ComponentFactory.createComponent('actor', config.actor),
      verb: ComponentFactory.createComponent('verb', config.verb),
      object: ComponentFactory.createComponent('object', config.object),
      result: ComponentFactory.createComponent('result', config.result),
    };

    this.strategies = {
      jsonLifeCycle: new JsonLifeCycleStrategy(),
      mcq: new McqStrategy(),
      time: new TimeBasedStrategy(),
      questionAction: new QuestionActionStrategy(),
      training: new TrainingStrategy(),
    };
  }

  createStatement(data) {
    const strategy = this.strategies[data?.mode] || this.strategies?.training;
    if (!strategy) {
      throw new Error(`Unsupported evaluation mode: ${data?.mode}`);
    }
    return strategy.buildStatement(data, this.components);
  }
}
