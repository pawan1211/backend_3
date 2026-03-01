const errorHandler = (err, req, res, next) => {
  console.error('ERROR:', err.message);

  if (err.code === '23505') {
    return res.status(409).json({ error: 'Record already exists.' });
  }
  if (err.code === '23503') {
    return res.status(400).json({ error: 'Referenced record not found.' });
  }

  const status = err.status || err.statusCode || 500;
  const message = status < 500 ? err.message : 'An unexpected error occurred.';
  res.status(status).json({ error: message });
};

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { errorHandler, asyncHandler };
