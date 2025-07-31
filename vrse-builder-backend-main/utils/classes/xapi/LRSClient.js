import axios from 'axios';
import { LRS_CREDENTIALS } from '../../../constants.js';
import logger from '../../logger.js';

class LRSClient {
  constructor(config) {
    this.endpoint = LRS_CREDENTIALS.ENDPOINT;
    this.auth = Buffer.from(
      `${LRS_CREDENTIALS.USERNAME}:${LRS_CREDENTIALS.PASSWORD}`,
    ).toString('base64');
    this.version = '1.0.3';
  }

  async sendStatement(statement) {
    try {
      const response = await axios.post(
        `${this.endpoint}/statements`,
        statement,
        {
          headers: {
            Authorization: `Basic ${this.auth}`,
            'X-Experience-API-Version': this.version,
            'Content-Type': 'application/json',
          },
        },
      );
      return response?.data;
    } catch (error) {
      logger.error(
        'LRS Error:',
        error.response?.data?.message || error.message,
      );
    }
  }

  async getStatements(query = {}) {
    try {
      const response = await axios.get(`${this.endpoint}/statements`, {
        params: query,
        headers: {
          Authorization: `Basic ${this.auth}`,
          'X-Experience-API-Version': this.version,
        },
      });
      return response?.data;
    } catch (error) {
      console.error('LRS Error:', error.response?.data || error.message);
    }
  }
}

export default LRSClient;
