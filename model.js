var firebase = require('./firebase');
var fs = require('fs');
var path = require('path');
var exec = require('child_process').exec;
var authConfig = require('./authConfig');
var https = require('https');

// Verifies the FB access token and passes the MainMuse access token
function verifyAccessToken(userId, token, cbError) {
  https.get('https://graph.facebook.com/me?access_token=' + token, function(res) {
    res.on('data', function(body) {
      var userObj = JSON.parse(body.toString());
      if (userId === userObj['id']) {
        cbError(false);
      } else {
        cbError(true);
      }
    });
  });
}

exports.verifyAccessToken = verifyAccessToken;
