// Service container - single source of truth for all service instances
const AuthService = require('./modules/auth.service');
const AuditService = require('./modules/audit.service');
const LoginAttemptService = require('./modules/loginAttempt.service');
const OrganizationService = require('./modules/organization.service');
const OrganizationFeaturesService = require('./modules/organizationFeatures.service');
const PermissionService = require('./modules/permission.service');
const RoleService = require('./modules/role.service');
const UserService = require('./modules/user.service');

// Initialize all services
const authService = new AuthService();
const auditService = new AuditService();
const loginAttemptService = new LoginAttemptService();
const organizationService = new OrganizationService();
const organizationFeaturesService = new OrganizationFeaturesService();
const permissionService = new PermissionService();
const roleService = new RoleService();
const userService = new UserService();

// Make services available globally for cross-references within services
global.authService = authService;
global.auditService = auditService;
global.loginAttemptService = loginAttemptService;
global.organizationService = organizationService;
global.organizationFeaturesService = organizationFeaturesService;
global.permissionService = permissionService;
global.roleService = roleService;
global.userService = userService;

// Export all services
module.exports = {
    authService,
    auditService,
    loginAttemptService,
    organizationService,
    organizationFeaturesService,
    permissionService,
    roleService,
    userService
};
