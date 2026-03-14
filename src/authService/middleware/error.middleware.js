const errorMiddleware = (err, req, res, next) => {
  console.error(err);
  
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';
  
  res.status(status).json({
    error: {
      status,
      message,
    },
  });
};

module.exports = errorMiddleware;
