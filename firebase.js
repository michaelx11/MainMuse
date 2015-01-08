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

function genSecret(length) {
    var text = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (var i=0; i < length; i++)
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    return text;
}

function genSecretUpper(length) {
    var text = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    for (var i=0; i < length; i++)
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    return text;
}

/**
 * Checks that username exists and that the provided token
 * matches the authentic token
 *
 */
function validateToken(username, token, cbError) {
  if (!checkString(username)) {
    cbError("User id contains invalid characters.");
    return;
  }

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
 * Either makes a blank queue with [status : accepted] or
 * sets the status to accepted for the queue corresponding to
 * "other friend".
 *
 * verifies:
 *  - username exists
 *  - token for username is correct
 *
 */
function addFriend(userid, token, otherFriendCode, cbError) {
  // check any paths used for Firebase
  if (!(checkString(userid) && checkString(otherFriendCode))) {
    cbError("Invalid userid or friend code.");
    return;
  }

  validateToken(userid, token, function(error) {
    if (error) {
      cbError(error);
      return;
    }

    checkFriendCode(otherFriendCode, function(otherid, error2) {
      if (error2) {
        cbError(error2);
        return;
      }

      // We can assume that the returned id is valid
      root.child('users')
        .child(userid)
        .child('queues')
        .child(otherid)
        .child('sync').transaction(function(syncObject) {
          // Either accept the request or build a new object with it accepted
          if (syncObject) {
            syncObject.status = "accepted";
            return syncObject;
          } else {
            var newSync = DEFAULT_SYNC_OBJECT;
            newSync.status = "accepted";
            return newSync;
          }
        }, function(err, committed, snapshot) {
          if (err) {
            cbError(err);
            return;
          }

          if (!committed) {
            cbError("Add friend transaction aborted.");
            return;
          }
        });
    });
  });
}

// NOTE: username and target user correspond to user id's, not full names
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

function editQueue(userid, token, targetuser, index, message, cbError) {
  if (!(checkString(userid) && checkString(targetuser))) {
    cbError("User " + userid + " or target user " + targetuser + " contains invalid characters.");
    return;
  }

  validateToken(username, token, function(error) {
    if (error) {
      cbDataError(false, error);
      return;
    }

    root.child('users')
      .child(targetuser)
      .child('queues')
      .child(userid)
      .child('sync').transaction(function(syncObj) {
        if (!syncObj) {
          // retry
          return DEFAULT_SYNC_OBJECT;
        }

        // Check if that message exists
        if (syncObj.tail <= index && index > 0) {
          return syncObj;
        }

        // abort
        return;
      }, function(err, committed, data) {
        if (err) {
          cbDataError(false, err);
          return;
        }
        if (!committed) {
          cbDataError(false, 'Edit queue, transaction failed to commit');
          return;
        }
        var syncObj = data.val();
        if (!syncObj) {
          cbError("No sync data found in appendQueue.");
          return;
        }

        root.child('users')
          .child(targetuser)
          .child('messages')
          .child(userid)
          .child('log')
          .child(index).set(message);
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
          // retry
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


function checkFriendCode(code, cbDataError) {
  root.child('codes')
    .child(code).once('value', function(data) {
      var userId = data.val();
      if (!userId) {
        cbDataError(false, "Code does not exist.");
        return;
      }

      cbDataError(userId, false);
    });
}

function getUnusedFriendCode(counter, cbDataError) {
  var MAX_TRIES = 8;
  if (counter > MAX_TRIES) {
    cbDataError(false, "Failed to find unused token!");
    return;
  }
  var friendCode = genSecret(6);
  checkFriendCode(friendCode, function(userId, error) {
    if (error) {
      cbDataError(friendCode, false);
      return;
    }
    getUnusedFriendCode(counter + 1, cbDataError);
  });
}

/**
 * Only call this method when the user id has been verified!
 */
function createUser(name, userid, email, cbTokenCodeError) {
  if (!checkString(userid)) {
    cbTokenCodeError(false, false, "Invalid user id!");
    return;
  }

  var userObj = {"name" : name, "id" : userid, "email" : email};

  var accessToken = genSecret(24);
  getUnusedFriendCode(0, function(friendCode, error) {
    if (error) {
      cbTokenCodeError(false, false, "Could not obtain unused friend code.");
      return;
    }
    userObj['friendcode'] = friendCode;
    userObj['token'] = accessToken;

    root.child('users')
      .child(userid)
      .once('value', function(userData) {
        var storedUser = userData.val();
        if (storedUser) {
          cbTokenCodeError(storedUser['token'], storedUser['friendcode'], false);
          return;
        }

        root.child('users').child(userid).set(userObj);
        root.child('codes').child(friendCode).set(userid);

        cbTokenCodeError(accessToken, friendCode, false);
        return;
      });
  });
}

function getUserData(userid, token, cbUserError) {
  if (!checkString(userid)) {
    cbUserError(false, "User id contains invalid characters.");
    return;
  }
  root.child('users')
    .child(userid).once('value', function(userData) {
      var user = userData.val();
      if (!user) {
        cbUserError(false, "Invalid user or token.");
        return;
      }

      var storedToken = user['token'];

      if (!(storedToken && (storedToken === token))) {
        cbUserError("Invalid user or token.");
        return;
      }

      cbUserError(user, false);
      return;
    });
}
