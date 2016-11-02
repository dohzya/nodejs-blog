var prismic = require('prismic-nodejs');
var configuration = require('./prismic-configuration');

var initialized = undefined;

function identity(el) { return el }

exports.init = function (app, options) {
  options = Object.assign({
    rewriteRoute: identity,
    exclude: [],
    rewriteKey: identity,
  }, options || configuration.quickRoutes || {});

  // these functions allow to define route rewritters like
  // {'/post/:uid': '/blog/:uid'}
  // so they will be transformed into
  // [[new RegExp('/post/:([^/]+)'), '/blog/$1']]
  function transformRouteRewrite(keyvalue, keepVariables) {
    var key = keyvalue[0];
    var value = keyvalue[1];
    if (new RegExp('/:').test(key)) {
      var refId = 0;
      var refs = {};
      key = new RegExp(key.replace(new RegExp('/:([^/]+)'), function (_, variable) {
        refId++;
        refs[variable] = '$' + refId;
        if (keepVariables) return '/(:[^/]+)';
        return '/:([^/]+)';
      }));
      value = value.replace(new RegExp('/:([^/]+)'), function (_, variable) {
        return '/' + refs[variable];
      });
    }
    return {key: key, value: value};
  }
  var routeRewrites;
  if (Array.isArray(options.rewriteRoute)) {
    routeRewrites = options.rewriteRoute;
  } else {
    routeRewrites = Object.keys(options.rewriteRoute).map(function (key) {
      return [key, options.rewriteRoute[key]];
    });
  }
  var routeRewritesKeepVariables = routeRewrites.map(function (keyvalue) {
    return transformRouteRewrite(keyvalue, true);
  });
  var routeRewritesNokeepVariables = routeRewrites.map(function (keyvalue) {
    return transformRouteRewrite(keyvalue, false);
  });

  function rewriteRoute(rewriteRoutes, route) {
    rewriteRoutes.forEach(function (keyvalue) {
      var key = keyvalue.key;
      var value = keyvalue.value;
      if (key instanceof RegExp) {
        if (key.test(route)) { route = route.replace(key, value); }
      } else {
        if (key === route) { route = value; }
      }
    })
    return route;
  }

  return getApi().then(function (api) {
    var genRoutes = {};
    var reverseRoutes = [];
    function addAction(route, action) {
      var rewritten = rewriteRoute(routeRewritesKeepVariables, route);
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
    api.quickRoutes.forEach(function (quickRoute) {
      if (!quickRoute.enabled) return;
      var routeStats = {static: 0, dynamic: 0};
      var route = '/' + quickRoute.fragments.map(function (fragment) {
        switch (fragment.kind) {
        case "static":
          routeStats.static++;
          return fragment.value;
        case "dynamic":
          routeStats.dynamic++;
          return ':' + options.rewriteKey(fragment.key);
        default:
          console.log('Unknown fragment kind: ', fragment);
        }
      }).join('/');
      if (options.only && options.only.indexOf(route) < 0) return;
      if (options.exclude.indexOf(route) >= 0) return;

      var fetchersStats = {singleton: 0, all: 0, withUid: 0};
      var fetchers = quickRoute.fetchers.map(function (fetcher) {
        var fn;
        switch (fetcher.condition && fetcher.condition.kind) {
        case "all":
          fetchersStats.all++;
          fn = function (api, req) {
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
          fetchersStats.singleton++;
          fn = function (api) {
            return api.getSingle(fetcher.mask);
          };
          break;
        case "withUid":
          fetchersStats.withUid++;
          var key = options.rewriteKey(fetcher.condition.key);
          fn = function (api, req) {
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
      }).filter(function (fetcher) { return !!fetcher; });

      addAction(route, function action(req, res) {

        exports.api(res).then(function (api) {
          function fetch(idx, fetched) {
            if (idx >= fetchers.length) { return Promise.resolve(fetched); }
            var fetcher = fetchers[idx];
            return fetcher.fn(api, req).then(function (value) {
              fetched[fetcher.variable] = value;
              return fetch(idx+1, fetched);
            });
          }
          return fetch(0, {}).then(function (data) {
            res.render(quickRoute.view || quickRoute.mask, data);
          });
        }).catch(exports.onError(res));

      });

      if (
        routeStats.dynamic == 0 &&
        fetchersStats.singleton == 1 && fetchersStats.withUid == 0
      ) {
        var fetcher = quickRoute.fetchers.find(function (fetcher) {
          return fetcher.condition.kind == "singleton";
        });
        reverseRoutes.push(function (doc) {
          if (doc.type === fetcher.mask) { return route; }
        })
      }
      if (
        routeStats.dynamic == 1 &&
        fetchersStats.withUid == 1
      ) {
        var fetcher = quickRoute.fetchers.find(function (fetcher) {
          return fetcher.condition.kind == "withUid";
        });
        reverseRoutes.push(function (doc) {
          if (doc.type === fetcher.mask) {
            return '/' + quickRoute.fragments.map(function (fragment) {
              switch (fragment.kind) {
              case "static": return fragment.value;
              case "dynamic": return ':' + encodeURIComponent(doc.uid);
              default: return undefined;
              }
            }).filter(function (el) { return !!el; }).join('/');
          }
        })
      }

    });
    if (!options.nopreview) {
      addAction('/preview', exports.preview);
    }
    var reverseRouter = function (doc) {
      var route;
      for (fn of reverseRoutes) {
        route = fn(doc);
        if (route) {
          if (Array.isArray(route)) route = route[0];
          return rewriteRoute(routeRewritesNokeepVariables, route);
        }
      }
    };
    initialized = {
      quickRoutes: genRoutes,
      reverseRouter: reverseRouter,
    }
    return initialized;
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

exports.onError = function (res) {
  return function (err) {
    console.error(err);
    res.status(500).send("Error 500: " + err.message);
  };
};

// Returns a Promise
exports.api = function (res) {
  // So we can use this information in the views
  var linkResolver = configuration.linkResolver;
  if (!linkResolver && initialized) {
    linkResolver = function (doc) {
      var route = initialized.reverseRouter(doc);
      if (route) { return route; }
      return '/';
    }
  }

  res.locals.ctx = {
    endpoint: configuration.apiEndpoint,
    linkResolver: linkResolver,
    reverseRouter: initialized && initialized.reverseRouter,
  };
  return getApi();
};

exports.preview = function (req, res) {
  exports.api(res).then(function (api) {
    return prismic.preview(api, configuration.linkResolver, req, res);
  });
};
