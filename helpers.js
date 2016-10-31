var prismic = require('prismic-nodejs');
var configuration = require('./prismic-configuration');

exports.onError = function(res) {
  return function(err) {
    console.error(err);
    res.status(500).send("Error 500: " + err.message);
  };
};

// Returns a Promise
exports.api = function(res) {
  // So we can use this information in the views
  res.locals.ctx = {
    endpoint: configuration.apiEndpoint,
    linkResolver: configuration.linkResolver
  };
  return prismic.api(configuration.apiEndpoint, {
    accessToken: configuration.accessToken
  });
};

exports.preview = function(req, res) {
  exports.api(res).then(function(api) {
    return prismic.preview(api, configuration.linkResolver, req, res);
  });
};
