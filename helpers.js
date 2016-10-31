var prismic = require('prismic-nodejs');
var configuration = require('./prismic-configuration');

exports.quickRoutes = function(app, options) {
  if (!options) options = configuration.quickRoutes || {};
  if (!options.rewriteRoute) options.rewriteRoute = {};
  if (!options.exclude) options.exclude = [];
  return getApi().then(function (api) {
    var genRoutes = {};
    function addAction(route, action) {
      var rewritten = options.rewriteRoute[route] || route;
      if (!options.nolog) {
        if (rewritten != route) {
          console.log("Generate route GET", rewritten, " (" + route + ")");
        } else {
          console.log("Generate route GET", rewritten);
        }
      }
      app.get(rewritten, action);
      genRoutes[rewritten] = action;
    }
    api.quickRoutes.forEach(function(quickRoute) {
      if (!quickRoute.enabled) return;
      var rewriteKey = options.rewriteKey || function (key) { return key; };
      var route = '/' + quickRoute.fragments.map(function(fragment) {
        switch (fragment.kind) {
        case "static": return fragment.value;
        case "dynamic": return ':' + rewriteKey(fragment.key);
        default:
          console.log('Unknown fragment kind: ', fragment);
        }
      }).join('/');
      if (options.only && options.only.indexOf(route) < 0) return;
      if (options.exclude.indexOf(route) >= 0) return;
      addAction(route, function action(req, res) {
        exports.api(res).then(function (api) {
          function fetch(idx, fetched) {
            if (idx >= quickRoute.fetchers.length) { return Promise.resolve(fetched); }
            var fetcher = quickRoute.fetchers[idx];
            switch (fetcher.condition.kind) {
            case "all":
              var queryOpts = {};
              if (fetcher.condition.sort) {
                queryOpts.page = req.params.p || '1';
                var sort_by = fetcher.condition.sort.field;
                var sort_dir = fetcher.condition.sort.dir == "desc" ? ' desc' : '';
                queryOpts.orderings = '[' + sort_by + sort_dir + ']';
              }
              return api.query(prismic.Predicates.at('document.type', fetcher.mask), queryOpts).then(function (docs) {
                fetched[fetcher.name || fetcher.mask] = docs.results;
                return fetch(idx+1, fetched);
              });
            case "singleton":
              return api.getSingle(quickRoute.mask).then(function (docs) {
                fetched[fetcher.mask] = docs;
                return fetch(idx+1, fetched);
              });
            case "withUid":
              var key = rewriteKey(fetcher.condition.key);
              return api.getByUID(quickRoute.mask, req.params[key]).then(function (docs) {
                fetched[fetcher.mask] = docs;
                return fetch(idx+1, fetched);
              });
            default:
              console.log("Unknown fetcher condition: ", fetcher);
              return fetch(idx+1, fetched);
            }
          }
          fetch(0, {}).then(function(data) {
            res.render(quickRoute.view || quickRoute.mask, data);
          }).catch(exports.onError(res));
        });
      });
    });
    if(!options.nopreview) {
      addAction('/preview', exports.preview);
    }
    return genRoutes;
  });
};

function getApi() {
  return prismic.api(configuration.apiEndpoint, {
    accessToken: configuration.accessToken
  }).then(function (api) {
    api.quickRoutes = [
      {
        "id": "WBa4PcQb6IcAjazK",
        "mask": "bloghome",
        "fragments": [
          {
            "kind": "static",
            "value": "bloghome"
          }
        ],
        "fetchers": [
          {
            "mask": "bloghome",
            "name": "bloghome",
            "condition": {
              "kind": "singleton"
            }
          },
          {
            "mask": "post",
            "name": "posts",
            "condition": {
              "kind": "all"
            }
          }
        ],
        "view": null,
        "enabled": true
      },
      {
        "id": "WBa4TsQb6HYAja0P",
        "mask": "post",
        "fragments": [
          {
            "kind": "static",
            "value": "post"
          },
          {
            "kind": "dynamic",
            "key": "post.uid"
          }
        ],
        "fetchers": [
          {
            "mask": "post",
            "condition": {
              "kind": "withUid",
              "key": "post.uid"
            }
          }
        ],
        "view": null,
        "enabled": true
      }
    ];
    return api;
  });
}

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
  return getApi();
};

exports.preview = function(req, res) {
  exports.api(res).then(function(api) {
    return prismic.preview(api, configuration.linkResolver, req, res);
  });
};
