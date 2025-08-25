import transporter from '../connectors/sendInBlueConnector.js';
import logger from '../logger.js';

class Email {
  static async send(mailOptions) {
    transporter.sendMail(mailOptions, function (error, info) {
      if (error) {
        logger.error(`EmailError: ${error}`);
      } else {
        logger.info(`Email sent: ${info.response}`);
      }
    });
  }
}

export default Email;
