import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';

import passport from 'passport';
import {
  login2FA,
  loginBasic,
  loginDevice,
  loginDomain,
  loginDomainToken,
  loginToken,
  loginTraineeDomainToken,
  logout,
  sendOtp2FA,
  authSso,
  sendInviteLink,
  loginOtpUser,
  loginGuest,
  loginFromExternalDirectories,
  loginDemo,
  loginCreator,
} from '../controllers/authController.js';
import {
  authenticateDomainToken,
  authenticateToken,
} from '../middlewares/auth.js';
import { controllerTryCatch } from '../middlewares/controllerTryCatch.js';
import { featureAccess } from '../middlewares/featureMiddleware.js';
import { validateSchema } from '../middlewares/validate.js';
import {
  loginBasicSchema,
  loginDeviceSchema,
  loginDomainSchema,
  loginTraineeDomainTokenSchema,
  sendOtp2FASchema,
} from '../validators/authValidation.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // Limit each IP to 60 requests per `window`
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

router.post('/login/token', authenticateToken, controllerTryCatch(loginToken));

router.post(
  '/create-invite-link',
  authenticateToken,
  controllerTryCatch(sendInviteLink),
);

router.post(
  '/login/basic',
  featureAccess('auth', { authType: 'BasicAuth' }),
  validateSchema(loginBasicSchema),
  loginLimiter,
  controllerTryCatch(loginBasic),
);

router.post(
  '/login/creator',
  validateSchema(loginBasicSchema),
  loginLimiter,
  controllerTryCatch(loginCreator),
);

// Guest login
router.post('/login/guest', loginLimiter, controllerTryCatch(loginGuest));

router.post('/login/demo', controllerTryCatch(loginDemo));

router.post('/login/sso', controllerTryCatch(authSso));

// {username,password,deviceID}
router.post(
  '/login/device',
  featureAccess('auth', { authType: 'SimpleAuth-Device' }),
  validateSchema(loginDeviceSchema),
  loginLimiter,
  controllerTryCatch(loginDevice),
);

// {domainName,domainPassword}
router.post(
  '/login/domain',
  featureAccess('auth', { authType: 'DomainAuth' }),
  validateSchema(loginDomainSchema),
  loginLimiter,
  controllerTryCatch(loginDomain),
);

router.post(
  '/login/domain/token',
  authenticateDomainToken,
  featureAccess('auth', { authType: 'DomainAuth' }),
  loginLimiter,
  controllerTryCatch(loginDomainToken),
);

router.post(
  '/login/domain/trainee',
  authenticateDomainToken,
  featureAccess('auth', { authType: 'DomainAuth' }),
  validateSchema(loginTraineeDomainTokenSchema),
  loginLimiter,
  controllerTryCatch(loginTraineeDomainToken),
);

router.post(
  '/login/2fa',
  featureAccess('auth', { authType: 'TwoFactorAuth' }),
  loginLimiter,
  controllerTryCatch(login2FA),
);

router.post(
  '/login/generateOtp',
  featureAccess('auth', { authType: 'TwoFactorAuth' }),
  loginLimiter,
  validateSchema(sendOtp2FASchema),
  controllerTryCatch(sendOtp2FA),
);

router.post(
  '/login/otp',
  loginLimiter,
  featureAccess('auth', { authType: 'SsoAuth' }),
  controllerTryCatch(loginOtpUser),
);

// LDAP login
router.post(
  '/login/external-directories',
  controllerTryCatch(loginFromExternalDirectories),
);

router.post('/logout', loginLimiter, controllerTryCatch(logout));

export default router;
