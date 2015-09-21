var firebase = require('./firebase');
var fs = require('fs');
var path = require('path');
var exec = require('child_process').exec;
var authConfig = require('./authConfig');
var https = require('https');
var zlib = require('zlib');

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

// Gzip compression
function zip(message, cbDataError) {
  zlib.gzip(new Buffer(message, 'base64').toString(), function(error, result) {
    if (error) {
      cbDataError(false, error);
    } else {
      var compressed = result.toString('base64');
      cbDataError(compressed, false);
    }
  });
}

function unzip(message, cbDataError) {
  zlib.gunzip(new Buffer(message, 'base64'), function(error, result) {
    if (error) {
      cbDataError(false, error);
    } else {
      var message = result.toString('base64');
      cbDataError(message, false);
    }
  });
}

function appendQueue(username, token, targetuser, message, cbError) {
  zip(message, function(compressedMessage, error) {
    if (error) {
      cbError(error);
    } else {
      firebase.appendQueue(username, token, targetuser, compressedMessage, cbError);
    }
  });
}

function editQueue(username, token, targetuser, index, message, cbError) {
  zip(message, function(compressedMessage, error) {
    if (error) {
      cbError(error);
    } else {
      firebase.editQueue(username, token, targetuser, index, compressedMessage, cbError);
    }
  });
}

function readQueue(username, token, sourceuser, cbDataError) {
  firebase.readQueue(username, token, sourceuser, function(data, error) {
    if (error) {
      cbDataError(false, error);
      return;
    }
    unzip(data, function(decompressedMessage, error) {
      if (error) {
        cbDataError(false, error);
      } else {
        cbDataError(decompressedMessage, false);
      }
    });
  });
}

var compressionErrorMessage = 'eyJzdWJqZWN0IjogIkVycm9yISIsICJib2R5IjoiRXJyb3Igd2l0aCBkZWNvbXByZXNzaW5nIHN0b3JlZCB0ZXh0LCBwbGVhc2UgZW1haWwgdXhtaWNoYWVsQGdtYWlsLmNvbSJ9';

function getMessageList(userid, token, sourceuser, cbMessagesError) {
  firebase.getMessageList(userid, token, sourceuser, function(messages, error) {
    if (error) {
      cbMessagesError(false, error);
    } else {
      for (var key in messages) {
        try {
          var unzipped = zlib.gunzipSync(new Buffer(messages[key], 'base64'));
          messages[key] = unzipped.toString('base64');
        } catch (err) {
          messages[key] = compressionErrorMessage;
        }
      }
      cbMessagesError(messages, false);
    }
  });
}

function getMessagesFrom(userid, token, sourceuser, cbMessagesError) {
  firebase.getMessagesFrom(userid, token, sourceuser, function(messages, error) {
    if (error) {
      cbMessagesError(false, error);
    } else {
      for (var key in messages) {
        try {
          var unzipped = zlib.gunzipSync(new Buffer(messages[key], 'base64'));
          messages[key] = unzipped.toString('base64');
        } catch (err) {
          messages[key] = compressionErrorMessage;
        }
      }
      cbMessagesError(messages, false);
    }
  });
}


exports.verifyFBAccessToken = verifyFBAccessToken;
exports.initializeUser = initializeUser;
// function appendQueue(username, token, targetuser, message, cbError)
exports.appendQueue = appendQueue;
// function editQueue(userid, token, targetuser, index, message, cbError)
exports.editQueue = editQueue;
// function readQueue(username, token, sourceuser, cbDataError)
exports.readQueue = readQueue;
// function getMessageList(userid, token, sourceuser, cbMessagesError)
exports.getMessageList = getMessageList;
// function getMessagesFrom(userid, token, sourceuser, cbMessagesError)
exports.getMessagesFrom = getMessagesFrom;

// Firebase direct functions

// function addFriend(userid, token, otherFriendCode, cbError)
exports.addFriend = firebase.addFriend;

// function getUserData(userid, token, cbUserError)
exports.getUserData = firebase.getUserData;

