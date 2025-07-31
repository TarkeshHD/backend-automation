import nodemailer from "nodemailer";

var transporter = nodemailer.createTransport({
  host: "smtp-relay.sendinblue.com",
  port: 587,
  tls: { rejectUnauthorized: false },

  auth: {
    user: process.env.SEND_IN_BLUE_USER,
    pass: process.env.SEND_IN_BLUE_KEY,
  },
});

export default transporter;
