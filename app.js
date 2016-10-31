var express = require('express');
var favicon = require('serve-favicon');
var logger = require('morgan');
var bodyParser = require('body-parser');
var methodOverride = require('method-override');
var path = require('path');

var helpers = require('./helpers');

var app = express();
app.set('port', process.env.PORT || 3000);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');
app.use(favicon("public/images/punch.png"));
app.use(logger('dev'));
app.use(bodyParser());
app.use(methodOverride());
app.use(express.static(path.join(__dirname, 'public')));

app.listen(app.get('port'), function() {
  console.log('Express server listening on port ' + app.get('port'));
});

helpers.quickRoutes(app, {
  rewriteRoute: {
    '/bloghome': ['/', '/blog'],
    '/post/:post_uid': '/blog/:post_uid',
  },
  rewriteKey: function (key) { return key.replace('.', '_'); },
});
