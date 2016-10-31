module.exports = {

  apiEndpoint: 'https://your-repo-name.prismic.io/api',

  // -- Access token if the Master is not open
  // accessToken: 'xxxxxx',

  // OAuth
  // clientId: 'xxxxxx',
  // clientSecret: 'xxxxxx',

  // -- Links resolution rules
  // This function will be used to generate links to Prismic.io documents
  // As your project grows, you should update this function according to your routes
  linkResolver: function(doc, ctx) {
    if (doc.type == 'blog') {
      return '/blog';
    }
    if (doc.type == 'post') {
      return '/blog/' + encodeURIComponent(doc.uid);
    }
    return '/';
  },

  quickRoutes: {
    // nolog: true,
    // nopreview: true,
    // exclude: ['/bloghome'],
    // only: ['/bloghome'],
    rewriteRoute: {
      '/bloghome': ['/', '/blog'],
      '/post/:post_uid': '/blog/:post_uid',
    },
    rewriteKey: function (key) { return key.replace('.', '_'); },
  },

};
