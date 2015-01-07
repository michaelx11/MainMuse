var express = require('express');
var http = require('http');
var Firebase = require('firebase');
var hbs = require('hbs');
var favicon = require('serve-favicon');
var authConfig = require('./authConfig');
/*
var passport = require('passport');
var FacebookStrategy = require("passport-facebook").Strategy;
*/

var firebase = require('./firebase');
var model = require('./model');
var routes = require('./routes');

var app = express();

// all environments

app.set('port', authConfig.port);
app.set('view engine', 'html');

app.use(express.cookieParser());
app.use(express.logger('dev'));

app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(express.static(__dirname + '/public'));
app.use(express.session({ secret: 'SECRET' }));
/*
app.use(passport.initialize());
app.use(passport.session());
*/

//app.use(routes.initialRouter);
app.use(app.router);

console.log(__dirname);

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

app.get('/verifyuser', routes.verifyUser);

http.createServer(app).listen(app.get('port'), function() {
  console.log('Express server listening on port ' + app.get('port'));
});
