// Permission Bitmap Utilities
// Efficient permission checking using bitwise operations
const logger = require('./logger');

/**
 * Permission Scopes (Bitmap values)
 * Each permission is represented by a bit
 */
const PERMISSIONS = {
    READ: 1,      // 00000001 (1)
    CREATE: 2,    // 00000010 (2)
    UPDATE: 4,    // 00000100 (4)
    DELETE: 8,    // 00001000 (8)
    EXPORT: 16,   // 00010000 (16)
    IMPORT: 32,   // 00100000 (32)
    APPROVE: 64,  // 01000000 (64)
    REJECT: 128   // 10000000 (128)
};

/**
 * Permission names mapping (for display/logging)
 */
const PERMISSION_NAMES = {
    1: 'READ',
    2: 'CREATE',
    4: 'UPDATE',
    8: 'DELETE',
    16: 'EXPORT',
    32: 'IMPORT',
    64: 'APPROVE',
    128: 'REJECT'
};

/**
 * Check if bitmap has specific permission
 * @param {number} bitmap - Permission bitmap
 * @param {string} permission - Permission name (e.g., 'READ', 'CREATE')
 * @returns {boolean}
 */
const hasPermission = (bitmap, permission) => {
    const permissionValue = PERMISSIONS[permission.toUpperCase()];
    
    if (!permissionValue) {
        logger.warn('Invalid permission name', { permission });
        return false;
    }

    return (bitmap & permissionValue) === permissionValue;
};

/**
 * Check if bitmap has multiple permissions
 * @param {number} bitmap - Permission bitmap
 * @param {array} permissions - Array of permission names
 * @returns {boolean} True if ALL permissions are present
 */
const hasAllPermissions = (bitmap, permissions) => {
    for (const permission of permissions) {
        if (!hasPermission(bitmap, permission)) {
            return false;
        }
    }
    return true;
};

/**
 * Check if bitmap has any of the specified permissions
 * @param {number} bitmap - Permission bitmap
 * @param {array} permissions - Array of permission names
 * @returns {boolean} True if ANY permission is present
 */
const hasAnyPermission = (bitmap, permissions) => {
    for (const permission of permissions) {
        if (hasPermission(bitmap, permission)) {
            return true;
        }
    }
    return false;
};

/**
 * Add permission to bitmap
 * @param {number} bitmap - Current permission bitmap
 * @param {string} permission - Permission to add
 * @returns {number} New bitmap
 */
const addPermission = (bitmap, permission) => {
    const permissionValue = PERMISSIONS[permission.toUpperCase()];
    
    if (!permissionValue) {
        logger.warn('Invalid permission name', { permission });
        return bitmap;
    }

    return bitmap | permissionValue;
};

/**
 * Remove permission from bitmap
 * @param {number} bitmap - Current permission bitmap
 * @param {string} permission - Permission to remove
 * @returns {number} New bitmap
 */
const removePermission = (bitmap, permission) => {
    const permissionValue = PERMISSIONS[permission.toUpperCase()];
    
    if (!permissionValue) {
        logger.warn('Invalid permission name', { permission });
        return bitmap;
    }

    return bitmap & ~permissionValue;
};

/**
 * Create bitmap from array of permission names
 * @param {array} permissions - Array of permission names
 * @returns {number} Permission bitmap
 */
const createBitmap = (permissions) => {
    let bitmap = 0;
    
    for (const permission of permissions) {
        bitmap = addPermission(bitmap, permission);
    }

    return bitmap;
};

/**
 * Convert bitmap to array of permission names
 * @param {number} bitmap - Permission bitmap
 * @returns {array} Array of permission names
 */
const bitmapToPermissions = (bitmap) => {
    const permissions = [];
    
    for (const [value, name] of Object.entries(PERMISSION_NAMES)) {
        if ((bitmap & parseInt(value)) === parseInt(value)) {
            permissions.push(name);
        }
    }

    return permissions;
};

/**
 * Get all permissions (bitmap with all bits set)
 * @returns {number} Full permission bitmap (255)
 */
const getAllPermissions = () => {
    return Object.values(PERMISSIONS).reduce((acc, val) => acc | val, 0);
};

/**
 * Check if bitmap has full permissions
 * @param {number} bitmap - Permission bitmap
 * @returns {boolean}
 */
const hasFullPermissions = (bitmap) => {
    return bitmap === getAllPermissions();
};

/**
 * Merge two bitmaps (union)
 * @param {number} bitmap1 - First bitmap
 * @param {number} bitmap2 - Second bitmap
 * @returns {number} Merged bitmap
 */
const mergeBitmaps = (bitmap1, bitmap2) => {
    return bitmap1 | bitmap2;
};

/**
 * Get common permissions between two bitmaps (intersection)
 * @param {number} bitmap1 - First bitmap
 * @param {number} bitmap2 - Second bitmap
 * @returns {number} Common permissions bitmap
 */
const getCommonPermissions = (bitmap1, bitmap2) => {
    return bitmap1 & bitmap2;
};

/**
 * Check if bitmap1 contains all permissions from bitmap2
 * @param {number} bitmap1 - First bitmap
 * @param {number} bitmap2 - Second bitmap (required permissions)
 * @returns {boolean}
 */
const containsAllPermissions = (bitmap1, bitmap2) => {
    return (bitmap1 & bitmap2) === bitmap2;
};

/**
 * Get missing permissions between two bitmaps
 * @param {number} currentBitmap - Current permissions
 * @param {number} requiredBitmap - Required permissions
 * @returns {array} Array of missing permission names
 */
const getMissingPermissions = (currentBitmap, requiredBitmap) => {
    const missingBitmap = requiredBitmap & ~currentBitmap;
    return bitmapToPermissions(missingBitmap);
};

/**
 * Format bitmap for display/logging
 * @param {number} bitmap - Permission bitmap
 * @returns {object} Formatted permissions object
 */
const formatBitmap = (bitmap) => {
    return {
        decimal: bitmap,
        binary: bitmap.toString(2).padStart(8, '0'),
        permissions: bitmapToPermissions(bitmap),
        count: bitmapToPermissions(bitmap).length
    };
};

/**
 * Validate bitmap value
 * @param {number} bitmap - Bitmap to validate
 * @returns {boolean}
 */
const isValidBitmap = (bitmap) => {
    return (
        typeof bitmap === 'number' &&
        bitmap >= 0 &&
        bitmap <= getAllPermissions() &&
        Number.isInteger(bitmap)
    );
};

/**
 * Parse permission string to bitmap
 * Examples: 'READ,CREATE,UPDATE' -> 7
 * @param {string} permissionString - Comma-separated permission names
 * @returns {number} Permission bitmap
 */
const parsePermissionString = (permissionString) => {
    if (!permissionString || typeof permissionString !== 'string') {
        return 0;
    }

    const permissions = permissionString
        .split(',')
        .map(p => p.trim().toUpperCase())
        .filter(p => PERMISSIONS[p]);

    return createBitmap(permissions);
};

/**
 * Get human-readable permission description
 * @param {number} bitmap - Permission bitmap
 * @returns {string} Description of permissions
 */
const getPermissionDescription = (bitmap) => {
    if (bitmap === 0) {
        return 'No permissions';
    }

    if (hasFullPermissions(bitmap)) {
        return 'Full access (all permissions)';
    }

    const permissions = bitmapToPermissions(bitmap);
    return permissions.join(', ');
};

/**
 * Permission presets for common roles
 */
const PERMISSION_PRESETS = {
    READ_ONLY: PERMISSIONS.READ,
    EDITOR: PERMISSIONS.READ | PERMISSIONS.CREATE | PERMISSIONS.UPDATE,
    ADMIN: getAllPermissions(),
    MODERATOR: PERMISSIONS.READ | PERMISSIONS.UPDATE | PERMISSIONS.APPROVE | PERMISSIONS.REJECT,
    DATA_MANAGER: PERMISSIONS.READ | PERMISSIONS.CREATE | PERMISSIONS.UPDATE | PERMISSIONS.EXPORT | PERMISSIONS.IMPORT
};

/**
 * Get preset bitmap by name
 * @param {string} presetName - Preset name
 * @returns {number|null} Permission bitmap or null
 */
const getPreset = (presetName) => {
    return PERMISSION_PRESETS[presetName.toUpperCase()] || null;
};

module.exports = {
    PERMISSIONS,
    PERMISSION_NAMES,
    PERMISSION_PRESETS,
    hasPermission,
    hasAllPermissions,
    hasAnyPermission,
    addPermission,
    removePermission,
    createBitmap,
    bitmapToPermissions,
    getAllPermissions,
    hasFullPermissions,
    mergeBitmaps,
    getCommonPermissions,
    containsAllPermissions,
    getMissingPermissions,
    formatBitmap,
    isValidBitmap,
    parsePermissionString,
    getPermissionDescription,
    getPreset
};
