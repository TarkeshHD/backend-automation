import { ROLES } from "../../constants.js";

export const forgotPasswordMail = (email, name, client, url) => {
  return {
    from: "noreply@autovrse-training.com",
    to: email,
    subject: "Shell Reactor Internals VR Experience - Forgot Password",
    html: `
      <p><b>Hi ${name} from ${client.name},</b></p>
      <p>A password reset request was made on ${new Date().toLocaleString()} for the <b>Shell Reactor Internals VR Experience</b>.</p>
      <p>Please click <a href='${url}' target='__blank'>here</a> to set new password for your account.</p>
      <p>Expires in 15 mins.</p>
      `,
  };
};

export const resetPasswordEmail = (email, name, client, url) => {
  return {
    from: "noreply@autovrse-training.com",
    to: email,
    subject: "Shell Reactor Internals VR Experience - Reset password",
    html: `
          <p><b>Hi ${name} from ${client.name},</b></p>
          <p>Your password for the <b>Shell Reactor Internals VR Experience</b> has expired on ${new Date().toLocaleString()} </p>
          <p>Please click <a href='${url}' target='__blank'>here</a> to set new password for your account.</p>
          <p>Expires in 15 mins.</p>
          `,
  };
};

export const activateAccountMail = (email, name, client, role, url) => {
  return {
    from: "noreply@autovrse-training.com",
    to: email,
    subject: "Shell Reactor Internals VR Experience - Complete Registration",
    html: `
        <p><b>Hi ${name} from ${client.name},</b></p>
        <p>${
          role === ROLES.SUPER_ADMIN
            ? `A <b>Super Admin</b> account has been created for you to access the <b>Shell Reactor Internals VR Experience Management Dashboard</b>.<br>Using this account you will have full access to the web dashboard.`
            : role === ROLES.ADMIN
            ? `An Admin account has been created for you to access the <b>Shell Reactor Internals VR Experience Management Dashboard</b>. Using this login you will be able to create trainer and trainee accounts.`
            : `An account has been created for you to access the <b>Shell Reactor Internals VR Experience</b> for <b>Quest 2</b>.<br> Using this login you will be able to login on the VR headset and train using the experience.`
        }</p>
        <p>name: ${name}</p>
        <p>${
          role === ROLES.USER
            ? `You would need to reset your password before you can login, please click <a href='${url}' target='__blank'>here</a> to activate the account and set your password.`
            : `Please click <a href='${url}' target='__blank'>here</a> to activate our account and set your password.`
        }</p>
        `,
  };
};

export const send2FAMail = (email, name, otp) => {
  return {
    from: "noreply@autovrse-training.com",
    to: email,
    subject: "Shell Reactor Internals VR Experience - 2FA login",
    html: `
    <p><b>Hi ${name},</b></p>
    <p>Please use this otp to login: ${otp}</p>
    `,
  };
};
