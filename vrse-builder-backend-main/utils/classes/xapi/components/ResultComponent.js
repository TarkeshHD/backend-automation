import { XAPIComponent } from '../XAPIComponent.js';
import { secondsToISO8601 } from '../../../utils.js';

export class ResultComponent extends XAPIComponent {
  build(data) {
    const modes = {
      jsonLifeCycle: () => this.buildJsonLifeCycleResult(data),
      mcq: () => this.buildMcqResult(data),
      time: () => this.buildTimeBasedResult(data),
      questionAction: () => this.buildQuestionActionBased(data),
    };

    return modes[data.mode]?.() || this.buildDefaultResult(data);
  }

  buildJsonLifeCycleResult(data) {
    const [rawScore, maxValue] = data?.score
      ?.split('/')
      .map((e) => Number(e)) || [0, 0];
    return {
      score: {
        raw: rawScore || 0,
        min: 0,
        max: maxValue || 0,
        scaled: parseFloat((maxValue > 0 ? rawScore / maxValue : 0).toFixed(2)),
      },
      success: data.status === 'pass',
      completion: Boolean(data.endTime),
    };
  }

  buildMcqResult(data) {
    const [rawScore, maxValue] = data?.score
      ?.split('/')
      .map((e) => Number(e)) || [0, 0];
    return {
      score: {
        raw: rawScore,
        min: 0,
        max: maxValue,
        scaled: parseFloat((maxValue > 0 ? rawScore / maxValue : 0).toFixed(2)),
      },
      success: data.status === 'pass',
      completion: Boolean(data.endTime),
    };
  }

  buildTimeBasedResult(data) {
    return {
      duration: secondsToISO8601(data?.answers?.timeBased?.timeTaken),
      success: data.status === 'pass',
      completion: Boolean(data.endTime),
    };
  }

  buildQuestionActionBased(data) {
    const [rawScore, maxValue] = data?.score
      ?.split('/')
      .map((e) => Number(e)) || [0, 0];
    return {
      score: {
        raw: rawScore,
        min: 0,
        max: maxValue,
        scaled: parseFloat((maxValue > 0 ? rawScore / maxValue : 0).toFixed(2)),
      },
      success: data.status === 'pass',
      completion: Boolean(data.endTime),
    };
  }

  buildDefaultResult(data) {
    return {
      success: data.status === 'pass',
      completion: true,
      score: {
        raw: 0,
        min: 0,
        max: 0,
        scaled: 0,
      },
    };
  }
}
