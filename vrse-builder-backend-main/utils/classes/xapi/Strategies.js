export class JsonLifeCycleStrategy {
  buildStatement(evaluation, components) {
    return {
      timestamp: new Date().toISOString(),
      actor: components.actor.build(evaluation),
      verb: components.verb.build(evaluation),
      object: components.object.build(evaluation),
      result: components.result.build(evaluation),
    };
  }
}

export class McqStrategy {
  buildStatement(evaluation, components) {
    return {
      timestamp: new Date().toISOString(),
      actor: components.actor.build(evaluation),
      verb: components.verb.build(evaluation),
      object: components.object.build(evaluation),
      result: components.result.build(evaluation),
    };
  }
}

export class TimeBasedStrategy {
  buildStatement(evaluation, components) {
    return {
      timestamp: new Date().toISOString(),
      actor: components.actor.build(evaluation),
      verb: components.verb.build(evaluation),
      object: components.object.build(evaluation),
      result: components.result.build(evaluation),
    };
  }
}

export class QuestionActionStrategy {
  buildStatement(evaluation, components) {
    return {
      timestamp: new Date().toISOString(),
      actor: components.actor.build(evaluation),
      verb: components.verb.build(evaluation),
      object: components.object.build(evaluation),
      result: components.result.build(evaluation),
    };
  }
}

export class TrainingStrategy {
  buildStatement(training, components) {
    return {
      timestamp: new Date().toISOString(),
      actor: components.actor.build(training),
      verb: components.verb.build(training),
      object: components.object.build(training),
    };
  }
}
