var prismic = require('prismic-nodejs');
var helpers = require('./helpers');

exports.bloghome = function(req, res) {
  helpers.api(res).then(function(api) {
    api.getSingle('bloghome').then(function(bloghome) {
      if(bloghome) {
        var page = req.params.p || '1';
        var options = {
          page: page,
          orderings:' [my.post.date desc]',
        };
        api
          .query(prismic.Predicates.at('document.type', 'post'), options)
          .then(function(response) {
            res.render('bloghome', {
              bloghome: bloghome,
              posts: response.results,
            });
          });
      } else {
        res.status(404).send('Not found');
      }
    });
  }).catch(helpers.onError(res));
};

exports.post = function(req, res) {
  var uid = req.params.uid;
  helpers.api(res).then(function(api) {
    return api
      .getByUID('post', uid)
      .then(function(post) {
        if(post) {
          res.render('post', {
            post: post,
          });
        } else {
          res.status(404).send('Not found');
        }
      });
  }).catch(helpers.onError(res));
};
