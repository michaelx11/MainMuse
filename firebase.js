/* Functions that interact with Firebase */

var Firebase = require('firebase');
var authConfig = require('./authConfig');
var root = new Firebase(authConfig.firebaseURL);
root.auth(authConfig.firebaseSecret);
var http = require('http');

/*
 * Schema
 *
 * minervastore
 *  users:
 *    michael:
 *      token: eightlet
 *      email: michaelx@mit.edu
 *      messages:
 *        otheruser:
 *          log:
 *            0: some message
 *            ...
 *        ...
 *      queues:
 *        otheruser:
 *          sync:
 *           head: 0
 *           tail: 20
 *           timestamp: 0
 *           interval: 3600 * 24 * 1000
 *           status: accepted [or pending]
 *        ...
 *      ...
 *    ...
 */
 
 
var DEFAULT_INTERVAL = 20 * 60 * 60;
var DEFAULT_SYNC_OBJECT = {status: "pending", head: 0, tail: 0, timestamp: 0, interval: DEFAULT_INTERVAL};
var ADMIN = {'michael': true};

// Keep track of current active users
userList = {};
exports.userList = userList;

function sanitizeUsername(username) {
  return username.replace(/[\[\]\.$#,]/g,'');
}

function checkString(rawString) {
  return sanitizeUsername(rawString) === rawString;
}

function hasAdminPrivileges (user) {
  console.log(user);
  console.log(user in ADMIN);
  return user in ADMIN;
}

function getCurrTimeMillis() {
  return (new Date()).getTime();
}

function genSecret() {
    var text = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (var i=0; i < 8; i++)
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    return text;
}

/**
 * Checks that username exists and that the provided token
 * matches the authentic token
 *
 */
function validateToken(username, token, cbError) {
  root.child('users')
    .child(username)
    .child('token').once('value', function(tokenData) {
      var storedToken = tokenData.val();
      if (!(storedToken && (storedToken === token))) {
        cbError("Error token does not match.");
        return;
      }

      cbError(false);
      return;
    });
}

/**
 * Checks that username exists
 */
function validateUser(username, cbError) {
  root.child('users')
    .child(username)
    .child('token').once('value', function(tokenData) {
      var storedToken = tokenData.val();
      if (!storedToken) {
        cbError("Error user " + username + " does not exist.");
        return;
      }

      cbError(false);
      return;
    });
}

/**
 * Send friend request or accept an outstanding one
 *
 * verifies:
 *  - username exists
 *  - token for username is correct
 *  - targetuser exists
 *
 */
function sendOrAcceptFriendRequest(username, token, targetuser, cbError) {
}

// Should optimize, right now reads the whole user in
/**
 * Creates and sets up a queue belonging to [username] for [targetuser]
 *
 * verifies:
 *  - username exists
 *  - token for username is correct
 *  - targetuser exists
 *
 *  callback(error) - false if no error
 */
function createQueueIfNeeded(username, token, targetuser, cbError) {

  if (!(checkString(username) && checkString(targetuser))) {
    cbError("Username " + username + " or target username " + targetuser + " contains invalid characters.");
    return;
  }

  validateToken(username, token, function(error) {
    if (error) {
      cbError(error);
      return;
    }

    root.child('users')
      .child(targetuser)
      .child('queues')
      .child(username)
      .child('sync')
      .child('status').once('value', function(targetStatusData) {
        targetStatus = targetStatusData.val();

        if (targetStatus) {
          cbError(false);
          return;
        }

        console.log("creating!");

        validateUser(targetuser, function(error) {
          if (error) {
            cbError(error);
            return;
          }
          var queue = {sync: DEFAULT_SYNC_OBJECT};
          var messagelog = {log: {"-1" : "placeholder"}};

          root.child('users').child(username).child('queues').child(targetuser).child('sync').set(queue);
          root.child('users').child(username).child('messages').child(targetuser).child('log').set(messagelog);
          cbError(false);
        });
    });
  });
}

function canGetNewMessage(syncObject) {
  if (!syncObject) {
    return false;
  }

  if (syncObject.head >= syncObject.tail) {
    return false;
  }

  var timestamp = syncObject.timestamp;
  var interval = syncObject.interval;

  var currentTimeMillis = getCurrTimeMillis();
  if (currentTimeMillis - timestamp < interval) {
    return false;
  }

  return true;
}

/**
 * Adds a message to the queue belonging to [username] for [targetuser]
 *
 * If the queue does not yet exist, create it
 *
 * verifies:
 *  - username exists
 *  - token for username is correct
 *  - targetuser exists
 */
function appendQueue(username, token, targetuser, message, cbError) {

  if (!(checkString(username) && checkString(targetuser))) {
    cbError("Username " + username + " or target username " + targetuser + " contains invalid characters.");
    return;
  }

  createQueueIfNeeded(username, token, targetuser, function(error) {
    if (error) {
      cbError(error);
      return;
    }

    console.log(targetuser + " -> " + username);
    root.child('users')
      .child(targetuser)
      .child('queues')
      .child(username)
      .child('sync').transaction(function(syncObj) {
        if (!syncObj) {
          // retry
          return DEFAULT_SYNC_OBJECT;
        }

        syncObj.tail = syncObj.tail + 1;
        return syncObj;
      }, function(err, committed, data) {
        if (err) {
          cbError(err);
          return;
        }
        if (!committed) {
          cbError('Append queue, transaction failed to commit');
          return;
        }

        var syncObj = data.val();
        if (!syncObj) {
          cbError("No sync data found in appendQueue.");
          return;
        }

        var newTail = syncObj.tail;
        if (!newTail) {
          cbError("Tail is undefined in appendQueue.");
          return;
        }

        root.child('users')
          .child(targetuser)
          .child('messages')
          .child(username)
          .child('log')
          .child(newTail).set(message);
      });
  });
}

function readQueue(username, token, sourceuser, cbDataError) {

  if (!(checkString(username) && checkString(sourceuser))) {
    cbDataError(false, "Username " + username + " or source username " + sourceuser + " contains invalid characters.");
    return;
  }

  validateToken(username, token, function(error) {
    if (error) {
      cbDataError(false, error);
      return;
    }

    root.child('users')
      .child(username)
      .child('queues')
      .child(sourceuser)
      .child('sync').transaction(function(syncObj) {
        if (!syncObj) {
          // abort
          return DEFAULT_SYNC_OBJECT;
        }

        // Can get new item
        if (canGetNewMessage(syncObj)) {
          syncObj.head += 1;
          syncObj.timestamp = getCurrTimeMillis();
        }

        return syncObj;
      }, function(err, committed, data) {
        if (err) {
          cbDataError(false, err);
          return;
        }
        if (!committed) {
          cbDataError(false, 'Append queue, transaction failed to commit');
          return;
        }

        var syncObj = data.val();
        console.log(syncObj);
        if (!syncObj) {
          cbDataError(false, "No sync data found in appendQueue.");
          return;
        }

        var head = syncObj.head;
        if (!head && head !== 0) {
          cbDataError(false, "Head is undefined in appendQueue.");
          return;
        }

        root.child('users')
          .child(username)
          .child('messages')
          .child(sourceuser)
          .child('log')
          .child(''+head).once('value', function(messageData) {
            var message = messageData.val();
            if (!message) {
              cbDataError(false, "Message does not exist yet");
              return;
            }
            
            cbDataError(message, false);
            return;
          });
      });
  });
}
