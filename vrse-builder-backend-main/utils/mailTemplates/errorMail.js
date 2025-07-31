var datetime = new Date().toLocaleString();

const errorMail = (error) => {
  return {
    from: process.env.EMAIL_SENDER,
    to: "sanjeev.mishra@autovrse.in",
    subject: "Critical Error in VRSE Builder",
    html: `<p>Critical error occured in VRSE builder at ${datetime}.<br><b>Error description</b><br>Name: ${error.name} <br>Status code: ${error.statusCode} <br>Message: ${error.message}</p>`,
  };
};

export default errorMail;
