const { authService } = require('../services');
const xsrfUtils = require('../utils/xsrfUtils');
const logger = require('../utils/logger');
const config = require('../../config');

class AuthController {
    async login(req, res, next) {
        try {
            const { email, emailOrPhone, password, systemName } = req.body;
            const identifier = (emailOrPhone || email || '').trim();
            const organizationId = req.headers['x-tenant-id'];
            const ipAddress = req.ip || req.connection.remoteAddress;
            const userAgent = req.headers['user-agent'];

            const context = {
                ipAddress,
                userAgent,
                systemName,
                requestId: req.requestId
            };

            const result = await authService.login(identifier, password, organizationId, context);

            res.cookie('refreshToken', result.refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 7 * 24 * 60 * 60 * 1000
            });

            res.cookie('accessToken', result.accessToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 30 * 60 * 1000
            });

            res.cookie('XSRF-TOKEN', result.xsrfToken, {
                httpOnly: false,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 30 * 60 * 1000
            });

            res.cookie('tenantDb', result.user.client, {
                httpOnly: false,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 30 * 60 * 1000
            });

            res.cookie('organizationId', result.user.organizationId, {
                httpOnly: false,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 30 * 60 * 1000
            });

            res.status(200).json({
                success: true,
                message: 'Login successful',
                data: {
                    userId: result.user.id,
                    accessToken: result.accessToken,
                    refreshToken: result.refreshToken,
                    xsrfToken: result.xsrfToken,
                    user: result.user
                }
            });
        } catch (error) {
            next(error);
        }
    }

    async register(req, res, next) {
        try {
            const { email, password, firstName, lastName, phoneNumber, roleId } = req.body;
            const organizationId = req.headers['x-tenant-id'];

            const userData = {
                email,
                password,
                firstName,
                lastName,
                phoneNumber,
                roleId
            };

            const result = await authService.register(userData, organizationId);

            res.status(201).json({
                success: true,
                message: 'Registration successful',
                data: {
                    user: result
                }
            });
        } catch (error) {
            next(error);
        }
    }

    async logout(req, res, next) {
        try {
            const accessToken = req.headers.authorization?.split(' ')[1];
            const refreshToken = req.cookies.refreshToken;

            await authService.logout(accessToken, refreshToken);

            res.clearCookie('refreshToken');
            res.clearCookie('XSRF-TOKEN');

            res.status(200).json({
                success: true,
                message: 'Logout successful'
            });
        } catch (error) {
            next(error);
        }
    }

    async refreshToken(req, res, next) {
        try {
            const refreshToken = req.cookies.refreshToken || req.body?.refreshToken;
            const xsrfHeaderToken = req.headers['x-xsrf-token'];
            const ipAddress = req.ip || req.connection.remoteAddress;
            const userAgent = req.headers['user-agent'];

            let result;

            if (refreshToken) {
                try {
                    result = await authService.refreshAccessToken(refreshToken);

                    // Candidate refresh returns new access + refresh + optional xsrf; set cookies and return data
                    if (result.isCandidate && result.refreshToken) {
                        res.cookie('refreshToken', result.refreshToken, {
                            httpOnly: true,
                            secure: process.env.NODE_ENV === 'production',
                            sameSite: 'strict',
                            maxAge: 7 * 24 * 60 * 60 * 1000
                        });
                        res.cookie('accessToken', result.accessToken, {
                            httpOnly: true,
                            secure: process.env.NODE_ENV === 'production',
                            sameSite: 'strict',
                            maxAge: 30 * 60 * 1000
                        });
                        return res.status(200).json({
                            success: true,
                            message: 'Token refreshed successfully',
                            data: {
                                accessToken: result.accessToken,
                                refreshToken: result.refreshToken,
                                user: result.user
                            }
                        });
                    }

                    // User refresh: return accessToken only
                    return res.status(200).json({
                        success: true,
                        message: 'Token refreshed successfully',
                        data: {
                            accessToken: result.accessToken
                        }
                    });
                } catch (refreshErr) {
                    logger.warn('Standard refresh failed, trying silent refresh', { error: refreshErr.message });
                }
            }

            // If refreshToken failed OR missing, try silent refresh with XSRF
            if (xsrfHeaderToken) {
                const context = {
                    ipAddress,
                    userAgent,
                    requestId: req.requestId
                };

                const silentResult = await authService.silentRefresh(xsrfHeaderToken, context);

                // Silent refresh returns new EVERYTHING (cookies included)
                res.cookie('refreshToken', silentResult.refreshToken, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'strict',
                    maxAge: 7 * 24 * 60 * 60 * 1000
                });

                res.cookie('accessToken', silentResult.accessToken, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'strict',
                    maxAge: 30 * 60 * 1000
                });

                res.cookie('XSRF-TOKEN', silentResult.xsrfToken, {
                    httpOnly: false,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'strict',
                    maxAge: 30 * 60 * 1000
                });

                return res.status(200).json({
                    success: true,
                    message: 'Silent refresh successful'
                });
            }

            return res.status(401).json({
                success: false,
                message: 'Session expired. Please log in again.'
            });
        } catch (error) {
            next(error);
        }
    }

    async changePassword(req, res, next) {
        try {
            const { oldPassword, newPassword } = req.body;
            const userId = req.user.userId;
            const organizationId = req.user.organizationId;
            const ipAddress = req.ip || req.connection.remoteAddress;
            const userAgent = req.headers['user-agent'];

            await authService.changePassword({
                userId,
                organizationId,
                oldPassword,
                newPassword,
                ipAddress,
                userAgent,
                requestId: req.requestId
            });

            res.status(200).json({
                success: true,
                message: 'Password changed successfully'
            });
        } catch (error) {
            next(error);
        }
    }

    async getCurrentUser(req, res, next) {
        try {
            res.status(200).json({
                success: true,
                message: 'User profile retrieved successfully',
                data: {
                    user: req.user
                }
            });
        } catch (error) {
            next(error);
        }
    }

    async candidateLogin(req, res, next) {
        try {
            const { emailOrPhone, password, systemName } = req.body || {};
            const identifier = (emailOrPhone || '').trim();
            const organizationId = req.headers['x-tenant-id'];
            const ipAddress = req.ip || req.connection.remoteAddress;
            const userAgent = req.headers['user-agent'];
            const context = { ipAddress, userAgent, systemName, requestId: req.requestId };

            const result = await authService.candidateLogin(identifier, password, organizationId, context);

            res.cookie('refreshToken', result.refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 7 * 24 * 60 * 60 * 1000
            });
            res.cookie('accessToken', result.accessToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 30 * 60 * 1000
            });
            res.cookie('XSRF-TOKEN', result.xsrfToken, {
                httpOnly: false,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 30 * 60 * 1000
            });

            res.status(200).json({
                success: true,
                message: 'Login successful',
                data: {
                    userId: result.user.id,
                    accessToken: result.accessToken,
                    refreshToken: result.refreshToken,
                    xsrfToken: result.xsrfToken,
                    user: result.user
                }
            });
        } catch (error) {
            if (error.message && error.message.includes('candidates only')) {
                return res.status(403).json({ success: false, message: error.message });
            }
            next(error);
        }
    }

    async candidateCheck(req, res, next) {
        try {
            const { emailOrPhone } = req.body || {};
            const key = (emailOrPhone || '').trim();
            if (!key) {
                return res.status(400).json({ success: false, message: 'Email or phone is required' });
            }
            const result = await authService.candidateCheck(key);
            res.status(200).json({ success: true, ...result });
        } catch (error) {
            next(error);
        }
    }

    async candidateSendOtp(req, res, next) {
        try {
            const { emailOrPhone } = req.body || {};
            const key = (emailOrPhone || '').trim();
            if (!key) {
                return res.status(400).json({ success: false, message: 'Email or phone is required' });
            }
            const result = await authService.candidateSendOtp(key);
            res.status(200).json({ success: true, message: 'OTP sent', sent: true, otp: result.otp, hint: result.hint });
        } catch (error) {
            next(error);
        }
    }

    async candidateVerifyOtp(req, res, next) {
        try {
            const { emailOrPhone, otp } = req.body || {};
            const key = (emailOrPhone || '').trim();
            if (!key || !otp) {
                return res.status(400).json({ success: false, message: 'Email/phone and OTP are required' });
            }
            await authService.candidateVerifyOtp(key, otp);
            res.status(200).json({ success: true, verified: true });
        } catch (error) {
            if (error.message === 'Incorrect OTP') {
                return res.status(400).json({ success: false, message: 'Incorrect OTP' });
            }
            next(error);
        }
    }

    async candidateGetDetails(req, res, next) {
        try {
            const { emailOrPhone, organizationId } = req.body || {};
            const key = (emailOrPhone || '').trim();
            if (!key) {
                return res.status(400).json({ success: false, message: 'Email or phone is required' });
            }
            const orgId = organizationId || process.env.CANDIDATE_DEFAULT_ORGANIZATION_ID;
            const result = await authService.candidateGetDetails(key, orgId);
            res.status(200).json({ success: true, candidate: result.candidate });
        } catch (error) {
            next(error);
        }
    }

    async candidateRegister(req, res, next) {
        try {
            const ipAddress = req.ip || req.connection.remoteAddress;
            const userAgent = req.headers['user-agent'];
            const context = { ipAddress, userAgent, requestId: req.requestId };
            const result = await authService.candidateRegister(req.body, context);

            res.cookie('refreshToken', result.refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 7 * 24 * 60 * 60 * 1000
            });
            res.cookie('accessToken', result.accessToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 30 * 60 * 1000
            });
            res.cookie('XSRF-TOKEN', result.xsrfToken, {
                httpOnly: false,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 30 * 60 * 1000
            });

            res.status(201).json({
                success: true,
                message: 'Registration successful',
                data: {
                    accessToken: result.accessToken,
                    refreshToken: result.refreshToken,
                    xsrfToken: result.xsrfToken,
                    user: result.user
                }
            });
        } catch (error) {
            next(error);
        }
    }

    async candidateForgotPassword(req, res, next) {
        try {
            const { emailOrPhone } = req.body || {};
            const key = (emailOrPhone || '').trim();
            if (!key) {
                return res.status(400).json({ success: false, message: 'Email or phone is required' });
            }
            await authService.candidateForgotPassword(key);
            res.status(200).json({
                success: true,
                message: 'If an account exists, you will receive reset instructions.'
            });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new AuthController();
