const getToken = () => {
  return process.env.AUTH_TOKEN;
};

const setToken = (token) => {
  process.env.AUTH_TOKEN = token;
};

const removeToken = () => {
  delete process.env.AUTH_TOKEN;
};

const isTokenValid = () => {
  return !!getToken();
};

module.exports = {
  getToken,
  setToken,
  removeToken,
  isTokenValid,
};
