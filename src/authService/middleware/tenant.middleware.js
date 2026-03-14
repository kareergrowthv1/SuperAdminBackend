const tenantMiddleware = (req, res, next) => {
  const tenantId = req.headers['x-tenant-id'];
  
  if (!tenantId) {
    return res.status(400).json({ message: 'Tenant ID is required' });
  }
  
  req.tenantId = tenantId;
  next();
};

module.exports = tenantMiddleware;
