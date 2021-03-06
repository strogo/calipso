/**
 * Calipso, a NodeJS CMS
 *
 * This file is the core application launcher.  See app-cluster for visibility
 * of how the application should be run in production mode
 *
 * Usage:  node app, or NODE_ENV=production node app
 *
 */

require.paths.unshift(__dirname); //make local paths accessible

var fs = require('fs'),
  express = require('express'),
  mongoose = require('mongoose'),
  sys = require('sys'),
  nodepath = require('path'),
  form = require('connect-form'),
  stylus = require('stylus'),
  translate = require('i18n/translate'),
  calipso = require('lib/calipso'),
  logo = require('logo'),
  colors = require('colors'),
  mongoStore = require('support/connect-mongodb');

// Local App Variables
var path = __dirname,
  theme = 'default',
  port = 3000,
  version = "0.2.1";

/**
 * Catch All exception handler
 */
process.on('uncaughtException', function (err) {
 console.log('Uncaught exception: ' + err + err.stack);
});


/**
 * Placeholder for application
 */
var app;

/**
 * Initial bootstrapping
 */
exports.boot = function(next) {

  //Create our express instance, export for later reference
  app = exports.app = express.createServer();
  app.path = path;
  app.version = version;

  // Import configuration
  require(path + '/conf/configuration.js')(app, function(err){

    if(err) {

      console.log("There was a fatal error loading Calipso, will terminate, reason:\r\n".bold.red);

      // Add additional detail to know errors
      switch (err.code) {
        case "ECONNREFUSED":
          console.log("Unable to connect to the specified database: ".magenta + app.set('db-uri'));
          break;
        default:
          console.log("Unknown error: ".magenta + err.message);
      }
      next();

    } else {

      // Load application configuration
      theme = app.set('config').theme;
      // Bootstrap application
      bootApplication(function() {
        next(app);
      });
    }

  });

};

/**
 *  App settings and middleware
 *  Any of these can be added into the by environment configuration files to
 *  enable modification by env.
 */
function bootApplication(next) {

  app.use(express.methodOverride());
  app.use(express.cookieParser());
  app.use(express.responseTime());
  app.use(express.session({ secret: 'calipso', store: mongoStore({ url: app.set('db-uri') }) }));

  // Default Theme
  calipso.defaultTheme = require(path + '/conf/configuration.js').getDefaultTheme();

  // Create holders for theme dependent middleware
  // These are here because they need to be in the connect stack before the calipso router
  // THese helpers are re-used when theme switching.
  app.mwHelpers = {};

  // Stylus
  app.mwHelpers.stylusMiddleware = function(path, theme) {
    var mw = stylus.middleware({
      src: path + '/themes/' + theme + '/stylus', // .styl files are located in `views/stylesheets`
      dest: path + '/themes/' + theme + '/public', // .styl resources are compiled `/stylesheets/*.css`
      debug: false,
      compile: function(str, path) { // optional, but recommended
        return stylus(str)
          .set('filename', path)
          .set('warn', true)
          .set('compress', true);
      }
    });
    mw.tag = 'theme.stylus';
    return mw;
  }

  // Static
  app.mwHelpers.staticMiddleware = function(path,theme) {
    var mw = express["static"](path + '/themes/' + theme + '/public',{maxAge:86400000});
    mw.tag = 'theme.static';
    return mw;
  }

  // Attach theme based middleware
  app.use(app.mwHelpers.stylusMiddleware(path,theme));
  app.use(app.mwHelpers.staticMiddleware(path,theme));

  // Media paths
  app.use(express["static"](path + '/media',{maxAge:86400000}));

  // connect-form
  app.use(form({
    keepExtensions: true
  }));

  // Translation - after static, set to add mode if appropriate
  app.use(translate.translate(app.set('config').language, app.set('language-add')));

  // Core calipso router
  app.use(calipso.calipsoRouter(next));

}


// allow normal node loading if appropriate
// e.g. not called from app-cluster or bin/calipso
if (!module.parent) {

  logo.print();

  exports.boot(function(app) {

    if(app) {
      app.listen(port);
      console.log("Calipso version: ".green + app.version);
      console.log("Calipso server listening on port: ".green + app.address().port);
      console.log("Calipso configured for: ".green + (global.process.env.NODE_ENV || 'development') + " environment.".green);
    } else {
      console.log("");
      process.exit();
    }

  });

}
