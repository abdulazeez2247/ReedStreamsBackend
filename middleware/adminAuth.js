module.exports = (req, res, next) => {
  const auth = req.headers.authorization;

  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const token = auth.split(' ')[1];

  if (token === process.env.ADMIN_TOKEN) {
    next();
  } else {
    return res.status(401).json({ message: 'Unauthorized' });
  }
};
