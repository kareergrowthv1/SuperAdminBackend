const config = require('../config');

const baseSwaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'KareerGrowth Superadmin Backend API',
    version: '1.0.0',
    description: 'Superadmin Backend Service - Proxy layer for administrative operations',
    contact: {
      name: 'KareerGrowth Team',
      email: 'support@kareergrowth.com'
    }
  },
  servers: [
    {
      url: process.env.SWAGGER_SERVER_URL,
      description: 'API server'
    }
  ],
  tags: [
    { name: 'Admin Management', description: 'Admin user and database management (proxied to AdminBackend)' },
    { name: 'Dashboard', description: 'Superadmin dashboard insights and health data' },
    { name: 'Health', description: 'Service health checks' }
  ],
  components: {
    securitySchemes: {
      serviceToken: {
        type: 'apiKey',
        in: 'header',
        name: 'X-Service-Token',
        description: 'Internal service authentication token'
      },
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT access token for authenticated requests'
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
      AdminCreateRequest: {
        type: 'object',
        required: ['email', 'password', 'clientName', 'totalInterviewCredits', 'totalPositionCredits', 'validTill'],
        properties: {
          email: {
            type: 'string',
            format: 'email',
            example: 'admin@company.com',
            description: 'Admin user email address'
          },
          password: {
            type: 'string',
            minLength: 8,
            example: 'SecurePass123!',
            description: 'Admin password (min 8 characters)'
          },
          firstName: {
            type: 'string',
            example: 'John',
            description: 'Admin first name'
          },
          lastName: {
            type: 'string',
            example: 'Doe',
            description: 'Admin last name'
          },
          phoneNumber: {
            type: 'string',
            example: '+1-555-0100',
            description: 'Admin phone number'
          },
          clientName: {
            type: 'string',
            example: 'AcmeCorp',
            description: 'Client company name (used to generate unique database)'
          },
          totalInterviewCredits: {
            type: 'integer',
            example: 100,
            description: 'Total interview credits allocated'
          },
          totalPositionCredits: {
            type: 'integer',
            example: 50,
            description: 'Total position credits allocated'
          },
          validTill: {
            type: 'string',
            format: 'date',
            example: '2027-12-31',
            description: 'Credits validity date (YYYY-MM-DD)'
          },
          roleId: {
            type: 'string',
            format: 'uuid',
            example: '76267ca0-69a9-4d0d-968b-df1449800629',
            description: 'Role ID (UUID) - determines admin type: ADMIN role = College, ATS role = Recruiter'
          }
        }
      },
      AdminCreateResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Admin user created successfully' },
          data: {
            type: 'object',
            properties: {
              userId: {
                type: 'string',
                format: 'uuid',
                example: '042ff635-2c76-43ca-8a56-68ca0b3727e6',
                description: 'Created admin user ID'
              },
              email: {
                type: 'string',
                format: 'email',
                example: 'admin@acmecorp.com'
              },
              firstName: {
                type: 'string',
                example: 'Sarah'
              },
              lastName: {
                type: 'string',
                example: 'Johnson'
              },
              schemaName: {
                type: 'string',
                example: 'acmecorp_mlvtnpkp',
                description: 'Generated database name for client'
              },
              clientName: {
                type: 'string',
                example: 'AcmeCorp'
              },
              credits: {
                type: 'object',
                properties: {
                  id: {
                    type: 'string',
                    format: 'uuid',
                    example: '0442b009-6092-427c-9ed8-07195a4660a1'
                  },
                  totalInterviewCredits: { type: 'integer', example: 150 },
                  totalPositionCredits: { type: 'integer', example: 75 },
                  validTill: { type: 'string', format: 'date', example: '2027-12-31' },
                  isActive: { type: 'boolean', example: true }
                }
              }
            }
          }
        }
      },
      HealthResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Service is healthy' },
          data: {
            type: 'object',
            properties: {
              service: { type: 'string', example: 'SuperadminBackend' },
              status: { type: 'string', example: 'healthy' },
              timestamp: { type: 'string', format: 'date-time' },
              uptime: { type: 'number', example: 3600.5 }
            }
          }
        }
      },
      DashboardSummaryResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Dashboard summary fetched successfully' },
          data: {
            type: 'object',
            properties: {
              totals: {
                type: 'object',
                properties: {
                  organizations: { type: 'integer', example: 12 },
                  admins: { type: 'integer', example: 8 },
                  activeAdmins: { type: 'integer', example: 6 },
                  users: { type: 'integer', example: 64 },
                  clients: { type: 'integer', example: 5 }
                }
              },
              trends: {
                type: 'object',
                properties: {
                  newOrganizations30d: { type: 'integer', example: 3 },
                  newUsers30d: { type: 'integer', example: 18 }
                }
              }
            }
          }
        }
      },
      CreditsOverviewResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Credits overview fetched successfully' },
          data: {
            type: 'object',
            properties: {
              totals: {
                type: 'object',
                properties: {
                  totalInterviewCredits: { type: 'integer', example: 1200 },
                  utilizedInterviewCredits: { type: 'integer', example: 480 },
                  remainingInterviewCredits: { type: 'integer', example: 720 },
                  totalPositionCredits: { type: 'integer', example: 600 },
                  utilizedPositionCredits: { type: 'integer', example: 210 },
                  remainingPositionCredits: { type: 'integer', example: 390 }
                }
              },
              byClient: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    client: { type: 'string', example: 'techcorp_m4n9b2a1' },
                    totalInterviewCredits: { type: 'integer', example: 300 },
                    utilizedInterviewCredits: { type: 'integer', example: 120 },
                    totalPositionCredits: { type: 'integer', example: 150 },
                    utilizedPositionCredits: { type: 'integer', example: 45 },
                    validTill: { type: 'string', format: 'date', example: '2026-12-31' }
                  }
                }
              },
              nearExpiry: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    client: { type: 'string', example: 'acme_9sd2p0k1' },
                    validTill: { type: 'string', format: 'date', example: '2026-03-12' },
                    daysLeft: { type: 'integer', example: 20 },
                    totalInterviewCredits: { type: 'integer', example: 200 },
                    totalPositionCredits: { type: 'integer', example: 90 }
                  }
                }
              }
            }
          }
        }
      },
      ActivityFeedResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Recent activity fetched successfully' },
          data: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    action: { type: 'string', example: 'CREATE' },
                    resourceType: { type: 'string', example: 'USER' },
                    resourceId: { type: 'string', example: 'c6c0e6ad-0a8f-4f6c-9a4b-ffb8e65f1c1b' },
                    status: { type: 'string', example: 'SUCCESS' },
                    createdAt: { type: 'string', format: 'date-time' },
                    user: {
                      type: 'object',
                      nullable: true,
                      properties: {
                        email: { type: 'string', example: 'admin@techcorp.com' },
                        name: { type: 'string', example: 'John Smith' }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      ServiceHealthResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Service health fetched successfully' },
          data: {
            type: 'object',
            properties: {
              database: {
                type: 'object',
                properties: {
                  status: { type: 'string', example: 'healthy' }
                }
              },
              services: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', example: 'admin-backend' },
                    status: { type: 'string', example: 'healthy' },
                    latencyMs: { type: 'integer', example: 42, nullable: true }
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check endpoint',
        description: 'Returns the health status of the Superadmin Backend service',
        responses: {
          200: {
            description: 'Service is healthy',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HealthResponse' }
              }
            }
          }
        }
      }
    },    '/dashboard/summary': {
      get: {
        tags: ['Dashboard'],
        summary: 'Get dashboard summary statistics',
        description: 'Fetches overview statistics including organizations, admins, users, clients, and recent trends',
        security: [{ serviceToken: [] }],
        responses: {
          200: {
            description: 'Summary data fetched successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DashboardSummaryResponse' }
              }
            }
          }
        }
      }
    },
    '/dashboard/credits': {
      get: {
        tags: ['Dashboard'],
        summary: 'Get credits overview',
        description: 'Fetches total credits, per-client breakdown, and near-expiry alerts. Only active credits (is_active=1) are included.',
        security: [{ serviceToken: [] }],
        responses: {
          200: {
            description: 'Credits data fetched successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreditsOverviewResponse' }
              }
            }
          }
        }
      }
    },
    '/dashboard/activity': {
      get: {
        tags: ['Dashboard'],
        summary: 'Get recent activity feed',
        description: 'Returns recent audit log activity items',
        security: [{ serviceToken: [] }],
        parameters: [
          {
            in: 'query',
            name: 'limit',
            schema: { type: 'integer', default: 8, minimum: 1, maximum: 50 },
            description: 'Number of activity items to return'
          }
        ],
        responses: {
          200: {
            description: 'Activity data fetched successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ActivityFeedResponse' }
              }
            }
          }
        }
      }
    },
    '/dashboard/health': {
      get: {
        tags: ['Dashboard'],
        summary: 'Get service and database health',
        description: 'Returns health check status for database and connected services',
        security: [{ serviceToken: [] }],
        responses: {
          200: {
            description: 'Health data fetched successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ServiceHealthResponse' }
              }
            }
          }
        }
      }
    },    '/dashboard/summary': {
      get: {
        tags: ['Dashboard'],
        summary: 'Get dashboard summary totals',
        description: 'Returns organization, admin, user, and client totals plus recent trends.',
        security: [{ serviceToken: [] }],
        responses: {
          200: {
            description: 'Dashboard summary response',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DashboardSummaryResponse' }
              }
            }
          }
        }
      }
    },
    '/dashboard/credits': {
      get: {
        tags: ['Dashboard'],
        summary: 'Get credits overview',
        description: 'Returns aggregated credits usage, per-client breakdown, and near-expiry list.',
        security: [{ serviceToken: [] }],
        responses: {
          200: {
            description: 'Credits overview response',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreditsOverviewResponse' }
              }
            }
          }
        }
      }
    },
    '/dashboard/activity': {
      get: {
        tags: ['Dashboard'],
        summary: 'Get recent activity feed',
        description: 'Returns latest audit log activity items.',
        security: [{ serviceToken: [] }],
        parameters: [
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', example: 8 }
          }
        ],
        responses: {
          200: {
            description: 'Activity feed response',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ActivityFeedResponse' }
              }
            }
          }
        }
      }
    },
    '/dashboard/health': {
      get: {
        tags: ['Dashboard'],
        summary: 'Get service health overview',
        description: 'Returns database and dependent service health status.',
        security: [{ serviceToken: [] }],
        responses: {
          200: {
            description: 'Service health response',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ServiceHealthResponse' }
              }
            }
          }
        }
      }
    },
    '/admins/create': {
      post: {
        tags: ['Admin Management'],
        summary: 'Create new admin user (proxied to AdminBackend)',
        description: `This endpoint proxies the request to AdminBackend service which creates a new admin user and dedicated client database.
        
**Architecture:**
- SuperadminBackend → AdminBackend (HTTP proxy)
- AdminBackend → Creates user in auth_db + new client database
        
**Process (handled by AdminBackend):**
1. Validates email uniqueness in auth_db.users
2. Generates unique database name from clientName
3. Creates admin user record in auth_db.users with client field
4. Creates new MySQL database for the client
5. Initializes database with full admin schema (13 tables)
6. Inserts credits record with is_active=true
        
**Note:** Only credits with is_active=true are shown in UI.`,
        security: [{ serviceToken: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AdminCreateRequest' },
              examples: {
                basic: {
                  summary: 'Basic admin creation',
                  value: {
                    email: 'admin@techstart.com',
                    password: 'SecurePass123!',
                    firstName: 'Alice',
                    lastName: 'Williams',
                    phoneNumber: '+1-555-0400',
                    clientName: 'TechStart',
                    totalInterviewCredits: 200,
                    totalPositionCredits: 100,
                    validTill: '2027-12-31'
                  }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: 'Admin user created successfully (response from AdminBackend)',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AdminCreateResponse' }
              }
            }
          },
          400: {
            description: 'Bad request - Missing required fields or validation error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
                examples: {
                  missingFields: {
                    summary: 'Missing required fields',
                    value: {
                      success: false,
                      message: 'Missing required fields: email, password, clientName'
                    }
                  },
                  emailExists: {
                    summary: 'Email already exists',
                    value: {
                      success: false,
                      message: 'Email already exists'
                    }
                  }
                }
              }
            }
          },
          401: {
            description: 'Unauthorized - Invalid or missing service token',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
                example: {
                  success: false,
                  message: 'Unauthorized'
                }
              }
            }
          },
          500: {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
                example: {
                  success: false,
                  message: 'Failed to create admin user'
                }
              }
            }
          },
          502: {
            description: 'Bad Gateway - AdminBackend service unavailable',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
                example: {
                  success: false,
                  message: 'AdminBackend service unavailable'
                }
              }
            }
          }
        }
      }
    }
  }
};

function joinPaths(basePath = '', routePath = '') {
  const left = String(basePath || '').replace(/\/$/, '');
  const right = String(routePath || '').replace(/^\//, '');
  if (!left && !right) return '/';
  if (!left) return `/${right}`;
  if (!right) return left || '/';
  return `${left}/${right}`;
}

function toOpenApiPath(path) {
  return String(path || '/')
    .replace(/:([A-Za-z0-9_]+)/g, '{$1}')
    .replace(/\/+/g, '/');
}

function extractPathParams(path) {
  const matches = String(path || '').match(/\{([A-Za-z0-9_]+)\}/g) || [];
  return matches.map((entry) => ({
    name: entry.slice(1, -1),
    in: 'path',
    required: true,
    schema: { type: 'string' },
  }));
}

function collectRouterEndpoints(router, basePath = '') {
  const endpoints = [];
  if (!router || !Array.isArray(router.stack)) return endpoints;

  for (const layer of router.stack) {
    if (layer.route && layer.route.path) {
      const routePaths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
      const methods = Object.keys(layer.route.methods || {}).filter((m) => layer.route.methods[m]);
      for (const routePath of routePaths) {
        const fullPath = toOpenApiPath(joinPaths(basePath, routePath));
        for (const method of methods) {
          endpoints.push({ path: fullPath, method: method.toLowerCase() });
        }
      }
      continue;
    }

    if (layer && layer.name === 'router' && layer.handle && Array.isArray(layer.handle.stack)) {
      endpoints.push(...collectRouterEndpoints(layer.handle, basePath));
    }
  }

  return endpoints;
}

function deriveTagFromBasePath(basePath) {
  const normalized = String(basePath || '').replace(/^\/+|\/+$/g, '');
  if (!normalized) return 'General';
  return normalized
    .split('/')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildSwaggerDocument(routeRegistrations = []) {
  const document = JSON.parse(JSON.stringify(baseSwaggerDocument));
  document.paths = document.paths || {};
  document.tags = document.tags || [];

  for (const registration of routeRegistrations) {
    const basePath = registration.basePath || '/';
    const router = registration.router;
    const tag = registration.tag || deriveTagFromBasePath(basePath);
    const endpoints = collectRouterEndpoints(router, basePath);

    if (!document.tags.some((t) => t.name === tag)) {
      document.tags.push({ name: tag, description: `${tag} endpoints` });
    }

    for (const endpoint of endpoints) {
      document.paths[endpoint.path] = document.paths[endpoint.path] || {};

      if (document.paths[endpoint.path][endpoint.method]) {
        continue;
      }

      const parameters = extractPathParams(endpoint.path);
      document.paths[endpoint.path][endpoint.method] = {
        tags: [tag],
        summary: `${endpoint.method.toUpperCase()} ${endpoint.path}`,
        responses: {
          200: {
            description: 'Success',
          },
        },
        ...(parameters.length ? { parameters } : {}),
      };
    }
  }

  return document;
}

module.exports = baseSwaggerDocument;
module.exports.buildSwaggerDocument = buildSwaggerDocument;
