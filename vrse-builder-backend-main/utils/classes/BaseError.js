import logger from "../logger.js";
import errorMail from "../mailTemplates/errorMail.js";
import Email from "./Email.js";

class BaseError extends Error {
  constructor(name, statusCode, message, isOperational = true) {
    super(message);

    Object.setPrototypeOf(this, new.target.prototype);
    this.name = name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this);
  }

  async handlerError() {
    logger.error(`${this.name} : ${this.message}`);
    if (!this.isOperational) {
      const mailOptions = errorMail(this);
      Email.send(mailOptions);
    }
  }
}

export default BaseError;
