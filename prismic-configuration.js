module.exports = {

  apiEndpoint: 'https://your-repo-name.prismic.io/api',

  // -- Access token if the Master is not open
  // accessToken: 'xxxxxx',

  // OAuth
  // clientId: 'xxxxxx',
  // clientSecret: 'xxxxxx',

  // -- Custom links resolution rules
  // This function will be used to generate links to Prismic.io documents
  // As your project grows, you should update this function according to your routes
  // linkResolver: function (doc, ctx) {
  //   // return generated routes
  //   var route = ctx.reverseRouter(doc)
  //   if (route) { return route; }

  //   // example of route (but this one is already handeled by the reverse router):
  //   // if (doc.type == 'blog') {
  //   //   return '/blog';
  //   // }

  //   // default route if nothing is found
  //   return '/';
  // },

  quickRoutes: {
    // nolog: true,
    // nopreview: true,
    // exclude: ['/bloghome'],
    // only: ['/bloghome'],
    rewriteRoute: [
      ['/bloghome', ['/', '/blog']],
      [new RegExp('/post/([^/]+)'), '/blog/$1'],
    ],
    rewriteKey: function (key) { return key.replace('.', '_'); },
  },

};
