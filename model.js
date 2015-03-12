var firebase = require('./firebase');
var fs = require('fs');
var path = require('path');
var exec = require('child_process').exec;
var authConfig = require('./authConfig');
var https = require('https');

// Verifies the FB access token and passes the MainMuse access token
// creates user if necessary
function verifyFBAccessToken(userId, fbToken, cbError) {
  https.get('https://graph.facebook.com/me?access_token=' + fbToken, function(res) {
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

/** Called when a user logs in. Retrieves the app access token,
 * creates the user if necessary.
 */
function initializeUser(userId, fbToken, userName, userEmail, cbTokenError) {
  verifyFBAccessToken(userId, fbToken, function(error) {
    if (error) {
      cbTokenError(false, "Invalid FB login token.");
      return;
    }
    firebase.getUserAccessToken(userName, userId, userEmail, cbTokenError);
  });
}

exports.verifyFBAccessToken = verifyFBAccessToken;
exports.initializeUser = initializeUser;

// function addFriend(userid, token, otherFriendCode, cbError)
exports.addFriend = firebase.addFriend;

// function appendQueue(username, token, targetuser, message, cbError)
exports.appendQueue = firebase.appendQueue;

// function editQueue(userid, token, targetuser, index, message, cbError)
exports.editQueue = firebase.editQueue;

// function readQueue(username, token, sourceuser, cbDataError)
exports.readQueue = firebase.readQueue;

// function getUserData(userid, token, cbUserError)
exports.getUserData = firebase.getUserData;

// function getMessageList(userid, token, sourceuser, cbMessagesError)
exports.getMessageList = firebase.getMessageList;

exports.getMessagesFrom = firebase.getMessagesFrom;
