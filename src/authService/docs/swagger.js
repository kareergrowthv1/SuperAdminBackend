const config = require('../config');

module.exports = {
  openapi: '3.0.0',
  info: {
    title: 'KareerGrowth Auth Service API',
    version: '1.0.0',
    description: 'Authentication and Authorization Service for KareerGrowth ATS Platform',
    contact: {
      name: 'KareerGrowth Team',
      email: 'support@kareergrowth.com'
    }
  },
  servers: [
    {
      url: `http://localhost:${config.port}`,
      description: 'Development server'
    },
    {
      url: 'https://api.kareergrowth.com',
      description: 'Production server'
    }
  ],
  tags: [
    { name: 'Authentication', description: 'Authentication endpoints' },
    { name: 'Users', description: 'User management endpoints' },
    { name: 'Roles', description: 'Role management endpoints' },
    { name: 'Permissions', description: 'Permission management endpoints' },
    { name: 'Organization Features', description: 'Organization feature management endpoints' },
    { name: 'Health', description: 'Service health and readiness checks' }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter JWT access token'
      },
      xsrfToken: {
        type: 'apiKey',
        in: 'header',
        name: 'X-XSRF-TOKEN',
        description: 'XSRF token from cookie'
      }
    },
    schemas: {
      ApiResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          message: { type: 'string' },
          data: { type: 'object' }
        }
      },
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string', example: 'Error message' },
          error: { type: 'string', example: 'ERROR_CODE' }
        }
      },
      AuthTokens: {
        type: 'object',
        properties: {
          accessToken: { type: 'string' },
          refreshToken: { type: 'string' },
          expiresIn: { type: 'integer', example: 1800 }
        }
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          phoneNumber: { type: 'string' },
          isActive: { type: 'boolean' },
          emailVerified: { type: 'boolean' },
          roleId: { type: 'string', format: 'uuid' },
          roleName: { type: 'string' }
        }
      },
      UserListResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string' },
          data: {
            type: 'object',
            properties: {
              users: { type: 'array', items: { $ref: '#/components/schemas/User' } },
              count: { type: 'integer' }
            }
          }
        }
      },
      UserResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string' },
          data: {
            type: 'object',
            properties: {
              user: { $ref: '#/components/schemas/User' }
            }
          }
        }
      },
      Role: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          description: { type: 'string' },
          version: { type: 'integer' }
        }
      },
      RoleListResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string' },
          data: {
            type: 'object',
            properties: {
              roles: { type: 'array', items: { $ref: '#/components/schemas/Role' } },
              count: { type: 'integer' }
            }
          }
        }
      },
      RoleResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string' },
          data: {
            type: 'object',
            properties: {
              role: { $ref: '#/components/schemas/Role' }
            }
          }
        }
      },
      Feature: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          key: { type: 'string' }
        }
      },
      FeatureListResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string' },
          data: {
            type: 'object',
            properties: {
              features: { type: 'array', items: { $ref: '#/components/schemas/Feature' } },
              count: { type: 'integer' }
            }
          }
        }
      },
      PermissionItem: {
        type: 'object',
        properties: {
          featureId: { type: 'string', format: 'uuid' },
          featureName: { type: 'string' },
          permissions: { type: 'integer', example: 15 }
        }
      },
      PermissionListResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string' },
          data: {
            type: 'object',
            properties: {
              permissions: { type: 'array', items: { $ref: '#/components/schemas/PermissionItem' } },
              count: { type: 'integer' }
            }
          }
        }
      },
      OrganizationFeature: {
        type: 'object',
        properties: {
          featureId: { type: 'string', format: 'uuid' },
          featureKey: { type: 'string' },
          isEnabled: { type: 'boolean' },
          config: { type: 'object' }
        }
      },
      OrganizationFeatureListResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string' },
          data: {
            type: 'object',
            properties: {
              features: { type: 'array', items: { $ref: '#/components/schemas/OrganizationFeature' } },
              count: { type: 'integer' }
            }
          }
        }
      }
    }
  },
  paths: {
    '/auth-session/login': {
      post: {
        summary: 'User login',
        tags: ['Authentication'],
        parameters: [
          {
            in: 'header',
            name: 'X-Tenant-ID',
            required: true,
            schema: { type: 'string' }
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string' },
                  password: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Login successful',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' },
                    data: {
                      type: 'object',
                      properties: {
                        accessToken: { type: 'string' },
                        user: { $ref: '#/components/schemas/User' },
                        permissions: { type: 'object' }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/auth-session/register': {
      post: {
        summary: 'User registration',
        tags: ['Authentication'],
        parameters: [
          {
            in: 'header',
            name: 'X-Tenant-ID',
            required: true,
            schema: { type: 'string' }
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string' },
                  password: { type: 'string' },
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                  phoneNumber: { type: 'string' },
                  roleId: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: 'Registration successful',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' },
                    data: {
                      type: 'object',
                      properties: {
                        user: { $ref: '#/components/schemas/User' }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/auth-session/logout': {
      post: {
        summary: 'User logout',
        tags: ['Authentication'],
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Logout successful',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiResponse' }
              }
            }
          }
        }
      }
    },
    '/auth-session/refresh': {
      post: {
        summary: 'Refresh access token',
        tags: ['Authentication'],
        responses: {
          200: {
            description: 'Token refreshed successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' },
                    data: { type: 'object', properties: { accessToken: { type: 'string' } } }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/auth-session/change-password': {
      post: {
        summary: 'Change password',
        tags: ['Authentication'],
        security: [{ bearerAuth: [] }, { xsrfToken: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  oldPassword: { type: 'string' },
                  newPassword: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Password changed successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiResponse' }
              }
            }
          }
        }
      }
    },
    '/auth-session/me': {
      get: {
        summary: 'Get current user profile',
        tags: ['Authentication'],
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'User profile retrieved',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' },
                    data: { type: 'object', properties: { user: { $ref: '#/components/schemas/User' } } }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/users': {
      get: {
        summary: 'Get all users',
        tags: ['Users'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'header', name: 'X-Tenant-ID', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: {
            description: 'Users retrieved successfully',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/UserListResponse' } } }
          }
        }
      },
      post: {
        summary: 'Create new user',
        tags: ['Users'],
        security: [{ bearerAuth: [] }, { xsrfToken: [] }],
        parameters: [
          { in: 'header', name: 'X-Tenant-ID', required: true, schema: { type: 'string' } }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string' },
                  password: { type: 'string' },
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                  phoneNumber: { type: 'string' },
                  roleId: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: 'User created successfully',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/UserResponse' } } }
          }
        }
      }
    },
    '/users/org/{orgId}': {
      get: {
        summary: 'Get all users by organization',
        tags: ['Users'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'orgId', required: true, schema: { type: 'string', format: 'uuid' } }
        ],
        responses: {
          200: {
            description: 'Users retrieved successfully',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/UserListResponse' } } }
          }
        }
      },
      post: {
        summary: 'Create new user within organization',
        tags: ['Users'],
        security: [{ bearerAuth: [] }, { xsrfToken: [] }],
        parameters: [
          { in: 'path', name: 'orgId', required: true, schema: { type: 'string', format: 'uuid' } }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string' },
                  password: { type: 'string' },
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                  phoneNumber: { type: 'string' },
                  roleId: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: 'User created successfully',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/UserResponse' } } }
          }
        }
      }
    },
    '/users/{id}': {
      get: {
        summary: 'Get user by ID',
        tags: ['Users'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
          { in: 'header', name: 'X-Tenant-ID', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: {
            description: 'User retrieved successfully',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/UserResponse' } } }
          }
        }
      },
      put: {
        summary: 'Update user',
        tags: ['Users'],
        security: [{ bearerAuth: [] }, { xsrfToken: [] }],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
          { in: 'header', name: 'X-Tenant-ID', required: true, schema: { type: 'string' } }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                  phoneNumber: { type: 'string' },
                  roleId: { type: 'string' },
                  isActive: { type: 'boolean' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'User updated successfully',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/UserResponse' } } }
          }
        }
      },
      delete: {
        summary: 'Delete user',
        tags: ['Users'],
        security: [{ bearerAuth: [] }, { xsrfToken: [] }],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
          { in: 'header', name: 'X-Tenant-ID', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: {
            description: 'User deleted successfully',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } }
          }
        }
      }
    },
    '/users/org/{orgId}/{id}': {
      get: {
        summary: 'Get user by ID within organization',
        tags: ['Users'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'orgId', required: true, schema: { type: 'string', format: 'uuid' } },
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }
        ],
        responses: {
          200: {
            description: 'User retrieved successfully',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/UserResponse' } } }
          }
        }
      },
      put: {
        summary: 'Update user within organization',
        tags: ['Users'],
        security: [{ bearerAuth: [] }, { xsrfToken: [] }],
        parameters: [
          { in: 'path', name: 'orgId', required: true, schema: { type: 'string', format: 'uuid' } },
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                  phoneNumber: { type: 'string' },
                  roleId: { type: 'string' },
                  isActive: { type: 'boolean' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'User updated successfully',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/UserResponse' } } }
          }
        }
      },
      delete: {
        summary: 'Delete user within organization',
        tags: ['Users'],
        security: [{ bearerAuth: [] }, { xsrfToken: [] }],
        parameters: [
          { in: 'path', name: 'orgId', required: true, schema: { type: 'string', format: 'uuid' } },
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }
        ],
        responses: {
          200: {
            description: 'User deleted successfully',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } }
          }
        }
      }
    },
    '/users/{id}/unlock': {
      put: {
        summary: 'Unlock user account',
        tags: ['Users'],
        security: [{ bearerAuth: [] }, { xsrfToken: [] }],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
          { in: 'header', name: 'X-Tenant-ID', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: {
            description: 'User account unlocked successfully',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } }
          }
        }
      }
    },
    '/users/org/{orgId}/{id}/unlock': {
      put: {
        summary: 'Unlock user account within organization',
        tags: ['Users'],
        security: [{ bearerAuth: [] }, { xsrfToken: [] }],
        parameters: [
          { in: 'path', name: 'orgId', required: true, schema: { type: 'string', format: 'uuid' } },
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }
        ],
        responses: {
          200: {
            description: 'User account unlocked successfully',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } }
          }
        }
      }
    },
    '/roles': {
      get: {
        summary: 'Get all roles',
        tags: ['Roles'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'header', name: 'X-Tenant-ID', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: {
            description: 'Roles retrieved successfully',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/RoleListResponse' } } }
          }
        }
      },
      post: {
        summary: 'Create new role',
        tags: ['Roles'],
        security: [{ bearerAuth: [] }, { xsrfToken: [] }],
        parameters: [
          { in: 'header', name: 'X-Tenant-ID', required: true, schema: { type: 'string' } }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: 'Role created successfully',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/RoleResponse' } } }
          }
        }
      }
    },
    '/roles/org/{orgId}': {
      get: {
        summary: 'Get all roles by organization',
        tags: ['Roles'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'orgId', required: true, schema: { type: 'string', format: 'uuid' } }
        ],
        responses: {
          200: {
            description: 'Roles retrieved successfully',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/RoleListResponse' } } }
          }
        }
      },
      post: {
        summary: 'Create new role within organization',
        tags: ['Roles'],
        security: [{ bearerAuth: [] }, { xsrfToken: [] }],
        parameters: [
          { in: 'path', name: 'orgId', required: true, schema: { type: 'string', format: 'uuid' } }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: 'Role created successfully',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/RoleResponse' } } }
          }
        }
      }
    },
    '/roles/{id}': {
      get: {
        summary: 'Get role by ID',
        tags: ['Roles'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
          { in: 'header', name: 'X-Tenant-ID', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: {
            description: 'Role retrieved successfully',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/RoleResponse' } } }
          }
        }
      },
      put: {
        summary: 'Update role',
        tags: ['Roles'],
        security: [{ bearerAuth: [] }, { xsrfToken: [] }],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
          { in: 'header', name: 'X-Tenant-ID', required: true, schema: { type: 'string' } }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Role updated successfully',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/RoleResponse' } } }
          }
        }
      },
      delete: {
        summary: 'Delete role',
        tags: ['Roles'],
        security: [{ bearerAuth: [] }, { xsrfToken: [] }],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
          { in: 'header', name: 'X-Tenant-ID', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: {
            description: 'Role deleted successfully',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } }
          }
        }
      }
    },
    '/roles/org/{orgId}/{id}': {
      get: {
        summary: 'Get role by ID within organization',
        tags: ['Roles'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'orgId', required: true, schema: { type: 'string', format: 'uuid' } },
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }
        ],
        responses: {
          200: {
            description: 'Role retrieved successfully',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/RoleResponse' } } }
          }
        }
      },
      put: {
        summary: 'Update role within organization',
        tags: ['Roles'],
        security: [{ bearerAuth: [] }, { xsrfToken: [] }],
        parameters: [
          { in: 'path', name: 'orgId', required: true, schema: { type: 'string', format: 'uuid' } },
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Role updated successfully',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/RoleResponse' } } }
          }
        }
      },
      delete: {
        summary: 'Delete role within organization',
        tags: ['Roles'],
        security: [{ bearerAuth: [] }, { xsrfToken: [] }],
        parameters: [
          { in: 'path', name: 'orgId', required: true, schema: { type: 'string', format: 'uuid' } },
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }
        ],
        responses: {
          200: {
            description: 'Role deleted successfully',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } }
          }
        }
      }
    },
    '/permissions/features': {
      get: {
        summary: 'Get all features',
        tags: ['Permissions'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'header', name: 'X-Tenant-ID', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: {
            description: 'Features retrieved successfully',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/FeatureListResponse' } } }
          }
        }
      }
    },
    '/permissions/org/{orgId}/features': {
      get: {
        summary: 'Get all features for organization context',
        tags: ['Permissions'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'orgId', required: true, schema: { type: 'string', format: 'uuid' } }
        ],
        responses: {
          200: {
            description: 'Features retrieved successfully',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/FeatureListResponse' } } }
          }
        }
      }
    },
    '/permissions/roles/{roleId}': {
      get: {
        summary: 'Get role permissions',
        tags: ['Permissions'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'roleId', required: true, schema: { type: 'string' } },
          { in: 'header', name: 'X-Tenant-ID', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: {
            description: 'Permissions retrieved successfully',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/PermissionListResponse' } } }
          }
        }
      }
    },
    '/permissions/org/{orgId}/roles/{roleId}': {
      get: {
        summary: 'Get role permissions within organization',
        tags: ['Permissions'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'path', name: 'orgId', required: true, schema: { type: 'string', format: 'uuid' } },
          { in: 'path', name: 'roleId', required: true, schema: { type: 'string', format: 'uuid' } }
        ],
        responses: {
          200: {
            description: 'Permissions retrieved successfully',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/PermissionListResponse' } } }
          }
        }
      }
    },
    '/permissions/roles/{roleId}/features/{featureId}': {
      put: {
        summary: 'Update role permission for a feature',
        tags: ['Permissions'],
        security: [{ bearerAuth: [] }, { xsrfToken: [] }],
        parameters: [
          { in: 'path', name: 'roleId', required: true, schema: { type: 'string' } },
          { in: 'path', name: 'featureId', required: true, schema: { type: 'string' } },
          { in: 'header', name: 'X-Tenant-ID', required: true, schema: { type: 'string' } }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  permissions: { type: 'integer', description: 'Permission bitmap (0-255)' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Permission updated successfully',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } }
          }
        }
      },
      delete: {
        summary: 'Delete role permission',
        tags: ['Permissions'],
        security: [{ bearerAuth: [] }, { xsrfToken: [] }],
        parameters: [
          { in: 'path', name: 'roleId', required: true, schema: { type: 'string' } },
          { in: 'path', name: 'featureId', required: true, schema: { type: 'string' } },
          { in: 'header', name: 'X-Tenant-ID', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: {
            description: 'Permission deleted successfully',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } }
          }
        }
      }
    },
    '/permissions/org/{orgId}/roles/{roleId}/features/{featureId}': {
      put: {
        summary: 'Update role permission for a feature within organization',
        tags: ['Permissions'],
        security: [{ bearerAuth: [] }, { xsrfToken: [] }],
        parameters: [
          { in: 'path', name: 'orgId', required: true, schema: { type: 'string', format: 'uuid' } },
          { in: 'path', name: 'roleId', required: true, schema: { type: 'string', format: 'uuid' } },
          { in: 'path', name: 'featureId', required: true, schema: { type: 'string', format: 'uuid' } }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  permissions: { type: 'integer', description: 'Permission bitmap (0-255)' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Permission updated successfully',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } }
          }
        }
      },
      delete: {
        summary: 'Delete role permission within organization',
        tags: ['Permissions'],
        security: [{ bearerAuth: [] }, { xsrfToken: [] }],
        parameters: [
          { in: 'path', name: 'orgId', required: true, schema: { type: 'string', format: 'uuid' } },
          { in: 'path', name: 'roleId', required: true, schema: { type: 'string', format: 'uuid' } },
          { in: 'path', name: 'featureId', required: true, schema: { type: 'string', format: 'uuid' } }
        ],
        responses: {
          200: {
            description: 'Permission deleted successfully',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } }
          }
        }
      }
    },
    '/permissions/roles/{roleId}/bulk': {
      put: {
        summary: 'Bulk update role permissions',
        tags: ['Permissions'],
        security: [{ bearerAuth: [] }, { xsrfToken: [] }],
        parameters: [
          { in: 'path', name: 'roleId', required: true, schema: { type: 'string' } },
          { in: 'header', name: 'X-Tenant-ID', required: true, schema: { type: 'string' } }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  permissions: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        featureId: { type: 'string' },
                        permissions: { type: 'integer' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Permissions updated successfully',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } }
          }
        }
      }
    },
    '/permissions/org/{orgId}/roles/{roleId}/bulk': {
      put: {
        summary: 'Bulk update role permissions within organization',
        tags: ['Permissions'],
        security: [{ bearerAuth: [] }, { xsrfToken: [] }],
        parameters: [
          { in: 'path', name: 'orgId', required: true, schema: { type: 'string', format: 'uuid' } },
          { in: 'path', name: 'roleId', required: true, schema: { type: 'string', format: 'uuid' } }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  permissions: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        featureId: { type: 'string' },
                        permissions: { type: 'integer' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Permissions updated successfully',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } }
          }
        }
      }
    },
    '/organization-features': {
      get: {
        summary: 'Get organization features',
        tags: ['Organization Features'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'header', name: 'X-Tenant-ID', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: {
            description: 'Features retrieved successfully',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/OrganizationFeatureListResponse' } } }
          }
        }
      }
    },
    '/organization-features/{featureId}/enabled': {
      put: {
        summary: 'Enable or disable feature',
        tags: ['Organization Features'],
        security: [{ bearerAuth: [] }, { xsrfToken: [] }],
        parameters: [
          { in: 'path', name: 'featureId', required: true, schema: { type: 'string' } },
          { in: 'header', name: 'X-Tenant-ID', required: true, schema: { type: 'string' } }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  isEnabled: { type: 'boolean' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Feature enabled status updated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } }
          }
        }
      }
    },
    '/organization-features/{featureId}/config': {
      put: {
        summary: 'Update feature configuration',
        tags: ['Organization Features'],
        security: [{ bearerAuth: [] }, { xsrfToken: [] }],
        parameters: [
          { in: 'path', name: 'featureId', required: true, schema: { type: 'string' } },
          { in: 'header', name: 'X-Tenant-ID', required: true, schema: { type: 'string' } }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  config: { type: 'object' }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Feature configuration updated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } }
          }
        }
      }
    },
    '/health': {
      get: {
        summary: 'Basic health check',
        tags: ['Health'],
        responses: {
          200: {
            description: 'Service health response',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' },
                    service: { type: 'string' },
                    version: { type: 'string' },
                    environment: { type: 'string' },
                    timestamp: { type: 'string', format: 'date-time' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/healthz': {
      get: {
        summary: 'Basic health check (alias)',
        tags: ['Health'],
        responses: {
          200: {
            description: 'Service health response',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' },
                    service: { type: 'string' },
                    version: { type: 'string' },
                    environment: { type: 'string' },
                    timestamp: { type: 'string', format: 'date-time' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/ready': {
      get: {
        summary: 'Readiness check (db/redis)',
        tags: ['Health'],
        responses: {
          200: {
            description: 'Service readiness response',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' },
                    checks: {
                      type: 'object',
                      properties: {
                        database: { type: 'string' },
                        redis: { type: 'string' }
                      }
                    }
                  }
                }
              }
            }
          },
          503: {
            description: 'Service not ready'
          }
        }
      }
    }
  }
};
