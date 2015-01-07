var express = require('express');
var http = require('http');
var Firebase = require('firebase');
var hbs = require('hbs');
var favicon = require('serve-favicon');
var authConfig = require('./authConfig');
/*
var passport = require('passport');
var routes = require('./routes');
var FacebookStrategy = require("passport-facebook").Strategy;
*/

var firebase = require('./firebase');
var model = require('./model');

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

function getLog(logName, callback) {
  root.child(logName).once('value', function(logData) {
    var logs = [];
    var logObject = logData.val();
    if (!logObject) {
      console.log("current log contains no data");
    } else {
      var revKeys = Object.keys(logObject).reverse();
      var u = 0;
      for (var i in revKeys) {
        var key = revKeys[i];
        if (u >= NUM_RECORDS) {
          break;
        }
        logs.push(logObject[key]);
        u++;
      }
    }
    callback(logs.reverse());
  });
}

function handleChat(req, res) {
  var message = req.query.message;
  if (message) {
    root.child('counter').transaction(function(count) {
      return count + 1;
    }, function(error, commit, snapshot) {
      if (error) {
        console.log("YO ERROR");
        res.end();
        return;
      }
      var c = snapshot.val();
      root.child('currentLog').once('value', function(data) {
        var currLog = data.val();
        if (!currLog) {
          console.log("current log value empty");
          res.end();
          return;
        }
        root.child(currLog).child(''+c).set(message);
        getLog(currLog, function(logData) {
          res.send({"log" : logData, "counter": c});
        });
      });
    });
  } else {
    root.child('counter').once('value', function(counterData) {
      var counter = counterData.val();
      if (!counter) {
        console.log("couldn't get counter value");
        res.end();
        return;
      }
      root.child('currentLog').once('value', function(data) {
        var currLog = data.val();
        if (!currLog) {
          console.log("current log value empty");
          return;
        }
        getLog(currLog, function(logData) {
          res.send({"log": logData, "counter": counter});
        });
      });
    });
  }
}

app.get('/mychatroom', handleChat);

http.createServer(app).listen(app.get('port'), function() {
  console.log('Express server listening on port ' + app.get('port'));
});
