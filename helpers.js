var prismic = require('prismic-nodejs');
var configuration = require('./prismic-configuration');

exports.quickRoutes = function(app, options) {
  options = Object.assign({
    rewriteRoute: {},
    exclude: [],
    rewriteKey: function (key) { return key; },
  }, options || configuration.quickRoutes || {});
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
      var route = '/' + quickRoute.fragments.map(function(fragment) {
        switch (fragment.kind) {
        case "static": return fragment.value;
        case "dynamic": return ':' + options.rewriteKey(fragment.key);
        default:
          console.log('Unknown fragment kind: ', fragment);
        }
      }).join('/');
      if (options.only && options.only.indexOf(route) < 0) return;
      if (options.exclude.indexOf(route) >= 0) return;

      var fetchers = quickRoute.fetchers.map(function(fetcher) {
        var fn;
        switch (fetcher.condition && fetcher.condition.kind) {
        case "all":
          fn = function(api, req) {
            var queryOpts = {};
            if (fetcher.condition.sort) {
              queryOpts.page = req.params.p || '1';
              var sort_by = fetcher.condition.sort.field;
              var sort_dir = fetcher.condition.sort.dir == "desc" ? ' desc' : '';
              queryOpts.orderings = '[' + sort_by + sort_dir + ']';
            }
            return api.query(prismic.Predicates.at('document.type', fetcher.mask), queryOpts).then(function (docs) {
              return docs.results;
            });
          };
          break;
        case "singleton":
          fn = function(api) {
            return api.getSingle(fetcher.mask);
          };
          break;
        case "withUid":
          var key = options.rewriteKey(fetcher.condition.key);
          fn = function(api, req) {
            return api.getByUID(fetcher.mask, req.params[key]);
          };
          break;
        default:
          console.log("Unknown fetcher condition: ", fetcher);
          return undefined;
        }
        return {
          variable: fetcher.name || fetcher.mask,
          fn: fn,
        };
      }).filter(function(fetcher) { return !!fetcher; });

      addAction(route, function action(req, res) {

        exports.api(res).then(function(api) {
          function fetch(idx, fetched) {
            if (idx >= fetchers.length) { return Promise.resolve(fetched); }
            var fetcher = fetchers[idx];
            return fetcher.fn(api, req).then(function(value) {
              fetched[fetcher.variable] = value;
              return fetch(idx+1, fetched);
            });
          }
          return fetch(0, {}).then(function(data) {
            res.render(quickRoute.view || quickRoute.mask, data);
          });
        }).catch(exports.onError(res));

      });
    });
    if(!options.nopreview) {
      addAction('/preview', exports.preview);
    }
    return {
      quickRoutes: genRoutes,
    };
  }).catch(function (err) { console.error(err); });
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
